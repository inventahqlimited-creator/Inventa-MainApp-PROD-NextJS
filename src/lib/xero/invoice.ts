// src/lib/xero/invoice.ts
// Closed sales orders → Draft invoices in Xero.
//   • Only a Closed order can be posted, and only once. It posts what shipped, as the printed invoice does.
//   • The order discount is spread across every line (Xero has no order-level discount).
//   • Each line's tax rate must be mapped in Settings → Xero → Accounts and tax, or the post stops with a clear message.
//   • The customer is posted to Xero first if it isn't there yet. Products already in Xero are linked by item code.
//   • After posting, Inventa never touches the Xero copy again. The returned total is compared with the invoice total.
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroPost } from './api'
import { resolveTaxType, type XeroSettings } from './mapping'
import { runSync } from './sync'
import { loadInvoicePayload } from '@/lib/invoice/data'

type Row = Record<string, unknown>
type Db = SupabaseClient
const MAX_BULK = 20
const GAP_MS = 1100 // stay inside Xero's 60 calls a minute

export type PostResult =
  | { ok: true; xeroId: string; number: string; url: string; warning: string | null }
  | { ok: false; status: number; error: string; recorded?: boolean }

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
const r4 = (x: number) => Math.round((x + Number.EPSILON) * 10000) / 10000
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
const money = (x: number) => `$${x.toFixed(2)}`

export const xeroInvoiceUrl = (xeroId: string) => `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${xeroId}`

/** "Net 30" / "30 days" → 30; "Due on receipt" → 0; anything else → null (Xero then uses its own default). */
export function dueInDays(terms: string | null | undefined): number | null {
  const t = clean(terms).toLowerCase()
  if (!t) return null
  if (/receipt|cod|cash|immediate|prepaid|upfront/.test(t)) return 0
  const m = t.match(/(\d{1,3})\s*(?:days?)?/)
  if (m && /net|day|\d/.test(t) && !/month|eom/.test(t)) return Number(m[1])
  return null
}
const addDays = (ymd: string, d: number) => { const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10) }

async function saveRecord(db: Db, orgId: string, soId: string, rec: { xero_id: string | null; status: 'synced' | 'failed'; error: string | null; meta?: Record<string, unknown> }) {
  await db.from('xero_sync_records').upsert(
    { org_id: orgId, entity: 'invoice', entity_id: soId, synced_at: new Date().toISOString(), meta: {}, ...rec },
    { onConflict: 'org_id,entity,entity_id' },
  )
}

type TaxRow = { id: string; name: string; rate: number }
/** The Xero tax type for a line: by its tax rate, or (older lines with no rate chosen) by an Inventa rate with the same percentage. */
function taxTypeFor(settings: XeroSettings, rates: TaxRow[], rateId: unknown, pct: unknown): { type: string } | { error: string } {
  if (typeof rateId === 'string' && rateId) {
    const t = resolveTaxType(settings, rateId, 'sales')
    if (t) return { type: t }
    const name = rates.find(r => r.id === rateId)?.name ?? 'A tax rate'
    return { error: `"${name}" isn’t mapped to a Xero tax rate.` }
  }
  const same = rates.filter(r => Math.abs(r.rate - n(pct)) < 0.0001)
  const types = new Set(same.map(r => resolveTaxType(settings, r.id, 'sales')))
  if (same.length > 0 && types.size === 1 && [...types][0]) return { type: [...types][0] as string }
  return { error: `A line uses ${n(pct)}% tax with no tax rate chosen, and it can’t be matched to one Xero tax rate.` }
}

export async function postInvoice(db: Db, orgId: string, soId: string, settings: XeroSettings): Promise<PostResult> {
  if (!settings.sales_account_code || !settings.purchases_account_code) {
    return { ok: false, status: 409, error: 'Save the Accounts and tax settings in Xero settings before posting invoices.' }
  }

  const { data: so } = await db.from('sales_orders').select(`
      id, so_number, status, customer_id, customer_name, ref,
      sales_order_lines ( product_id, product_name, product_sku, quantity, quantity_picked, quantity_packed, quantity_shipped, unit_price, discount, tax_rate, tax_rate_id, line_notes, sort_order ),
      sales_order_cost_lines ( product_name, description, amount, tax_rate, tax_rate_id, sort_order )
    `).eq('org_id', orgId).eq('id', soId).maybeSingle()
  const order = so as (Row & { sales_order_lines?: Row[]; sales_order_cost_lines?: Row[] }) | null
  if (!order) return { ok: false, status: 404, error: 'Order not found.' }
  if (String(order.status).toLowerCase() !== 'closed') return { ok: false, status: 409, error: 'Only closed sales orders can be posted to Xero.' }

  const { data: existing } = await db.from('xero_sync_records').select('status').eq('org_id', orgId).eq('entity', 'invoice').eq('entity_id', soId).maybeSingle()
  if ((existing as { status?: string } | null)?.status === 'synced') return { ok: false, status: 409, error: 'This order has already been posted to Xero.' }

  const fail = async (status: number, error: string): Promise<PostResult> => {
    await saveRecord(db, orgId, soId, { xero_id: null, status: 'failed', error })
    return { ok: false, status, error, recorded: true }
  }

  // The printed invoice is the source for the number, date, terms and total, so Xero matches what the customer was sent.
  const payload = await loadInvoicePayload(db, orgId, [soId])
  const inv = payload.orders[0]
  if (!inv) return fail(409, 'This order can’t be invoiced.')

  // Customer: use the linked Xero contact, posting it first when needed.
  const customerId = clean(order.customer_id)
  if (!customerId) return fail(409, 'This order has no customer.')
  const contactLink = async () => {
    const { data } = await db.from('xero_sync_records').select('xero_id, status').eq('org_id', orgId).eq('entity', 'contact').eq('entity_id', customerId).maybeSingle()
    const l = data as { xero_id: string | null; status: string } | null
    return l?.status === 'synced' ? l.xero_id : null
  }
  let contactId = await contactLink()
  if (!contactId) {
    const r = await runSync(db, orgId, 'contact', { ids: [customerId], settings })
    if (!r.ok) return r.status === 429 || r.status === 401 ? { ok: false, status: r.status, error: r.error } : fail(502, `Could not post the customer to Xero first. ${r.error}`)
    contactId = await contactLink()
    if (!contactId) return fail(422, `Could not post the customer to Xero first. ${r.summary.failures[0]?.error ?? ''}`.trim())
  }

  // Which products are already items in Xero.
  const lines = [...(order.sales_order_lines ?? [])].sort((a, b) => n(a.sort_order) - n(b.sort_order))
  const productIds = [...new Set(lines.map(l => clean(l.product_id)).filter(Boolean))]
  const synced = new Set<string>()
  if (productIds.length) {
    const { data } = await db.from('xero_sync_records').select('entity_id').eq('org_id', orgId).eq('entity', 'product').eq('status', 'synced').in('entity_id', productIds)
    for (const r of (data ?? []) as { entity_id: string }[]) synced.add(r.entity_id)
  }

  const { data: taxData } = await db.from('tax_rates').select('id, name, rate').eq('org_id', orgId)
  const rates = ((taxData ?? []) as { id: string; name: string; rate: number | string }[]).map(r => ({ id: r.id, name: r.name, rate: n(r.rate) }))

  // The order discount comes off every line, as on the printed invoice.
  const pre = inv.items_subtotal + inv.costs_subtotal
  const factor = pre > 0 ? inv.subtotal / pre : 1
  const discountRate = (lineDiscountPct: number) => {
    const pct = r4((1 - (1 - lineDiscountPct / 100) * factor) * 100)
    return pct > 0.00005 ? Math.min(pct, 100) : 0
  }

  const problems = new Set<string>()
  const items: Record<string, unknown>[] = []
  for (const l of lines) {
    const picked = n(l.quantity_picked), packed = n(l.quantity_packed), sent = n(l.quantity_shipped)
    const qty = sent > 0 ? sent : packed > 0 ? packed : picked
    if (qty <= 0) continue
    const tax = taxTypeFor(settings, rates, l.tax_rate_id, l.tax_rate)
    if ('error' in tax) { problems.add(tax.error); continue }
    const name = clean(l.product_name) || 'Item'
    const note = clean(l.line_notes)
    const code = clean(l.product_sku)
    const dr = discountRate(n(l.discount))
    items.push({
      Description: (note ? `${name}\n${note}` : name).slice(0, 4000),
      Quantity: qty,
      UnitAmount: n(l.unit_price),
      AccountCode: settings.sales_account_code,
      TaxType: tax.type,
      ...(dr ? { DiscountRate: dr } : {}),
      ...(code && synced.has(clean(l.product_id)) ? { ItemCode: code } : {}),
    })
  }
  for (const c of [...(order.sales_order_cost_lines ?? [])].sort((a, b) => n(a.sort_order) - n(b.sort_order))) {
    if (n(c.amount) === 0) continue
    const tax = taxTypeFor(settings, rates, c.tax_rate_id, c.tax_rate)
    if ('error' in tax) { problems.add(tax.error); continue }
    const label = clean(c.product_name) || clean(c.description) || 'Additional cost'
    const sub = clean(c.product_name) ? clean(c.description) : ''
    const dr = discountRate(0)
    items.push({
      Description: (sub ? `${label}\n${sub}` : label).slice(0, 4000),
      Quantity: 1,
      UnitAmount: n(c.amount),
      AccountCode: settings.sales_account_code,
      TaxType: tax.type,
      ...(dr ? { DiscountRate: dr } : {}),
    })
  }
  if (problems.size) return fail(422, `${[...problems].slice(0, 3).join(' ')} Map ${problems.size === 1 ? 'it' : 'them'} in Settings → Integrations → Xero → Accounts and tax, then post again.`)
  if (items.length === 0) return fail(422, 'Nothing to invoice: no shipped quantities on this order.')

  const date = inv.invoice_date ?? new Date().toISOString().slice(0, 10)
  const days = dueInDays(inv.terms)
  const body = {
    Invoices: [{
      Type: 'ACCREC',
      Contact: { ContactID: contactId },
      Date: date,
      ...(days !== null ? { DueDate: addDays(date, days) } : {}),
      InvoiceNumber: inv.invoice_number,
      ...(inv.customer_po ? { Reference: inv.customer_po } : {}),
      ...(inv.currency ? { CurrencyCode: inv.currency } : {}),
      Status: 'DRAFT',
      LineAmountTypes: 'Exclusive',
      LineItems: items,
    }],
  }

  const res = await xeroPost<{ Invoices?: { InvoiceID?: string; InvoiceNumber?: string; Total?: number; HasErrors?: boolean; ValidationErrors?: { Message?: string }[] }[] }>(
    db, orgId, '/Invoices?summarizeErrors=false&unitdp=4', body,
  )
  if (!res.ok) return res.status === 429 || res.status === 401 ? { ok: false, status: res.status, error: res.error } : fail(res.status === 400 ? 422 : 502, res.error)

  const out = res.data.Invoices?.[0]
  if (!out?.InvoiceID || out.HasErrors) {
    const msg = out?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this invoice.'
    return fail(422, msg)
  }

  const xeroTotal = r2(n(out.Total))
  const diff = r2(xeroTotal - inv.total)
  const warning = Math.abs(diff) > 0.01 ? `Xero’s total is ${money(xeroTotal)} but the Inventa invoice total is ${money(inv.total)} (difference ${money(Math.abs(diff))}). Check the draft in Xero.` : null
  const number = clean(out.InvoiceNumber) || inv.invoice_number
  await saveRecord(db, orgId, soId, {
    xero_id: out.InvoiceID, status: 'synced', error: warning,
    meta: { number, total: inv.total, xero_total: xeroTotal, customer: clean(order.customer_name), date },
  })
  return { ok: true, xeroId: out.InvoiceID, number, url: xeroInvoiceUrl(out.InvoiceID), warning }
}

// ── Several at once (Sync invoices / Sync now) ──────────────────────────────

export type BulkSummary = { posted: number; failed: number; remaining: number; failures: { id: string; name: string; error: string }[]; stopped?: string }

/** Posts up to 20 Closed, not-yet-posted orders. Returns how many are left so the caller can ask again. */
export async function postEligibleInvoices(db: Db, orgId: string, settings: XeroSettings, retryFailed = true): Promise<BulkSummary> {
  const [{ data: closed }, { data: recs }] = await Promise.all([
    db.from('sales_orders').select('id, so_number').eq('org_id', orgId).ilike('status', 'closed').order('created_at', { ascending: true }),
    db.from('xero_sync_records').select('entity_id, status').eq('org_id', orgId).eq('entity', 'invoice'),
  ])
  const done = new Set(((recs ?? []) as { entity_id: string; status: string }[]).filter(r => r.status === 'synced' || (!retryFailed && r.status === 'failed')).map(r => r.entity_id))
  const todo = ((closed ?? []) as { id: string; so_number: string | null }[]).filter(o => !done.has(o.id))

  const out: BulkSummary = { posted: 0, failed: 0, remaining: 0, failures: [] }
  const batch = todo.slice(0, MAX_BULK)
  for (let i = 0; i < batch.length; i++) {
    const o = batch[i]
    const r = await postInvoice(db, orgId, o.id, settings)
    if (r.ok) out.posted++
    else {
      if (r.status === 429 || r.status === 401) { out.stopped = r.error; out.remaining = todo.length - out.posted - out.failed; return out }
      out.failed++
      out.failures.push({ id: o.id, name: o.so_number ?? 'Order', error: r.error })
    }
    if (i < batch.length - 1) await sleep(GAP_MS)
  }
  out.remaining = Math.max(0, todo.length - batch.length)
  return out
}

// ── Dashboard numbers (from Inventa only; no call to Xero) ──────────────────

export type InvoiceOverview = {
  eligible: number; posted: number; notPosted: number; failed: number
  failures: { id: string; name: string; error: string | null }[]
  recent: { id: string; number: string; customer: string; total: number; postedAt: string; url: string; warning: string | null }[]
  lastPostedAt: string | null
}

export async function invoiceOverview(db: Db, orgId: string): Promise<InvoiceOverview> {
  const [{ data: closed }, { data: recs }] = await Promise.all([
    db.from('sales_orders').select('id, so_number').eq('org_id', orgId).ilike('status', 'closed'),
    db.from('xero_sync_records').select('entity_id, xero_id, status, error, synced_at, meta').eq('org_id', orgId).eq('entity', 'invoice').order('synced_at', { ascending: false }),
  ])
  const orders = new Map(((closed ?? []) as { id: string; so_number: string | null }[]).map(o => [o.id, o]))
  type Rec = { entity_id: string; xero_id: string | null; status: string; error: string | null; synced_at: string; meta: { number?: string; total?: number; customer?: string } | null }
  const all = (recs ?? []) as Rec[]
  const posted = all.filter(r => r.status === 'synced')
  const failedRecs = all.filter(r => r.status === 'failed' && orders.has(r.entity_id))
  const postedIds = new Set(posted.map(r => r.entity_id))
  const eligible = [...orders.keys()]
  return {
    eligible: eligible.length,
    posted: eligible.filter(id => postedIds.has(id)).length,
    notPosted: eligible.filter(id => !postedIds.has(id) && !failedRecs.some(f => f.entity_id === id)).length,
    failed: failedRecs.filter(f => !postedIds.has(f.entity_id)).length,
    failures: failedRecs.filter(f => !postedIds.has(f.entity_id)).slice(0, 100).map(f => ({ id: f.entity_id, name: orders.get(f.entity_id)?.so_number ?? 'Order', error: f.error })),
    recent: posted.slice(0, 5).map(r => ({
      id: r.entity_id, number: r.meta?.number ?? '', customer: r.meta?.customer ?? '', total: Number(r.meta?.total ?? 0),
      postedAt: r.synced_at, url: r.xero_id ? xeroInvoiceUrl(r.xero_id) : '', warning: r.error,
    })),
    lastPostedAt: posted[0]?.synced_at ?? null,
  }
}
