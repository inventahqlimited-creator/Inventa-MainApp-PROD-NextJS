// src/lib/xero/bill.ts
// Purchase orders → bills in Xero (Draft or Approved, as chosen in Settings). Xero has no purchase-order step here: only the bill is posted.
//   • Only a Closed order with something received can be posted, and only once. It posts what was received (a short delivery is billed as received).
//   • The order discount is spread across every line (Xero has no order-level discount).
//   • Each line's tax rate must be mapped (purchases side) in Settings → Xero → Accounts and tax, or the post stops with a clear message.
//   • The supplier is posted to Xero first if it isn't there yet. Products already in Xero are linked by item code.
//   • After posting, Inventa never touches the Xero copy again. The returned total is compared with the expected total.
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroPost } from './api'
import type { XeroSettings } from './mapping'
import type { XeroPrefs } from './prefs'
import { runSync } from './sync'
import { addDays, clean, dueInDays, money, n, r2, saveRecord, sleep, taxTypeFor, type PostResult, type BulkSummary } from './invoice'

type Row = Record<string, unknown>
type Db = SupabaseClient
const MAX_BULK = 20
const GAP_MS = 1100
const r4 = (x: number) => Math.round((x + Number.EPSILON) * 10000) / 10000

export const xeroBillUrl = (xeroId: string) => `https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=${xeroId}`

const day = (v: unknown) => (v ? String(v).slice(0, 10) : '')

/** Something has been received on the order. A closed order is finished, so it is billed for what actually arrived (even if short). */
export function hasReceived(lines: Row[]): boolean {
  return lines.some(l => n(l.quantity_received) > 0)
}

export async function postBill(db: Db, orgId: string, poId: string, settings: XeroSettings, prefs: XeroPrefs): Promise<PostResult> {
  if (!settings.sales_account_code || !settings.purchases_account_code) {
    return { ok: false, status: 409, error: 'Save the Accounts and tax settings in Xero settings before posting bills.' }
  }

  const { data: po } = await db.from('purchase_orders').select(`
      id, po_number, status, supplier_id, supplier_name, ref, reference, terms, currency, order_date, received_date, expected_date, created_at,
      order_discount, order_discount_type,
      purchase_order_lines ( product_id, product_name, product_sku, quantity_ordered, quantity_received, unit_cost, discount, tax_rate, tax_rate_id, line_notes, sort_order ),
      purchase_order_cost_lines ( product_name, description, amount, tax_rate, tax_rate_id, sort_order )
    `).eq('org_id', orgId).eq('id', poId).maybeSingle()
  const order = po as (Row & { purchase_order_lines?: Row[]; purchase_order_cost_lines?: Row[] }) | null
  if (!order) return { ok: false, status: 404, error: 'Order not found.' }
  if (String(order.status).toLowerCase() !== 'closed') return { ok: false, status: 409, error: 'Only closed purchase orders can be posted to Xero.' }

  const { data: existing } = await db.from('xero_sync_records').select('status').eq('org_id', orgId).eq('entity', 'bill').eq('entity_id', poId).maybeSingle()
  if ((existing as { status?: string } | null)?.status === 'synced') return { ok: false, status: 409, error: 'This order has already been posted to Xero.' }

  const fail = async (status: number, error: string): Promise<PostResult> => {
    await saveRecord(db, orgId, poId, { xero_id: null, status: 'failed', error }, 'bill')
    return { ok: false, status, error, recorded: true }
  }

  const lines = [...(order.purchase_order_lines ?? [])].sort((a, b) => n(a.sort_order) - n(b.sort_order))
  if (!hasReceived(lines)) return fail(409, 'Nothing has been received on this order, so there is nothing to bill.')

  const supplierId = clean(order.supplier_id)
  if (!supplierId) return fail(409, 'This order has no supplier.')
  const contactLink = async () => {
    const { data } = await db.from('xero_sync_records').select('xero_id, status').eq('org_id', orgId).eq('entity', 'contact').eq('entity_id', supplierId).maybeSingle()
    const l = data as { xero_id: string | null; status: string } | null
    return l?.status === 'synced' ? l.xero_id : null
  }
  let contactId = await contactLink()
  if (!contactId) {
    const r = await runSync(db, orgId, 'contact', { ids: [supplierId], settings })
    if (!r.ok) return r.status === 429 || r.status === 401 ? { ok: false, status: r.status, error: r.error } : fail(502, `Could not post the supplier to Xero first. ${r.error}`)
    contactId = await contactLink()
    if (!contactId) return fail(422, `Could not post the supplier to Xero first. ${r.summary.failures[0]?.error ?? ''}`.trim())
  }

  const productIds = [...new Set(lines.map(l => clean(l.product_id)).filter(Boolean))]
  const synced = new Set<string>()
  if (productIds.length) {
    const { data } = await db.from('xero_sync_records').select('entity_id').eq('org_id', orgId).eq('entity', 'product').eq('status', 'synced').in('entity_id', productIds)
    for (const r of (data ?? []) as { entity_id: string }[]) synced.add(r.entity_id)
  }
  const { data: taxData } = await db.from('tax_rates').select('id, name, rate').eq('org_id', orgId)
  const rates = ((taxData ?? []) as { id: string; name: string; rate: number | string }[]).map(r => ({ id: r.id, name: r.name, rate: n(r.rate) }))

  // Work out what the bill should total (received quantities, discounts, order discount, tax) so Xero's answer can be checked.
  const costs = [...(order.purchase_order_cost_lines ?? [])].sort((a, b) => n(a.sort_order) - n(b.sort_order)).filter(c => n(c.amount) !== 0)
  const lineAmt = (l: Row) => r2(n(l.quantity_received) * n(l.unit_cost) * (1 - n(l.discount) / 100))
  const itemsSub = r2(lines.reduce((s, l) => s + lineAmt(l), 0))
  const costsSub = r2(costs.reduce((s, c) => s + r2(n(c.amount)), 0))
  const pre = itemsSub + costsSub
  const dv = n(order.order_discount)
  const discAmt = r2(pre <= 0 ? 0 : order.order_discount_type === '%' ? pre * (dv / 100) : Math.min(dv, pre))
  const subtotal = r2(pre - discAmt)
  const factor = pre > 0 ? subtotal / pre : 1
  let taxSum = 0
  for (const l of lines) taxSum += lineAmt(l) * factor * (n(l.tax_rate) / 100)
  for (const c of costs) taxSum += n(c.amount) * factor * (n(c.tax_rate) / 100)
  const expectedTotal = r2(subtotal + r2(taxSum))

  const discountRate = (lineDiscountPct: number) => {
    const pct = r4((1 - (1 - lineDiscountPct / 100) * factor) * 100)
    return pct > 0.00005 ? Math.min(pct, 100) : 0
  }

  const problems = new Set<string>()
  const items: Record<string, unknown>[] = []
  for (const l of lines) {
    const qty = n(l.quantity_received)
    if (qty <= 0) continue
    const tax = taxTypeFor(settings, rates, l.tax_rate_id, l.tax_rate, 'purchases')
    if ('error' in tax) { problems.add(tax.error); continue }
    const name = clean(l.product_name) || 'Item'
    const note = clean(l.line_notes)
    const code = clean(l.product_sku)
    const dr = discountRate(n(l.discount))
    items.push({
      Description: (note ? `${name}\n${note}` : name).slice(0, 4000),
      Quantity: qty,
      UnitAmount: n(l.unit_cost),
      AccountCode: settings.purchases_account_code,
      TaxType: tax.type,
      ...(dr ? { DiscountRate: dr } : {}),
      ...(code && synced.has(clean(l.product_id)) ? { ItemCode: code } : {}),
    })
  }
  for (const c of costs) {
    const tax = taxTypeFor(settings, rates, c.tax_rate_id, c.tax_rate, 'purchases')
    if ('error' in tax) { problems.add(tax.error); continue }
    const label = clean(c.product_name) || clean(c.description) || 'Additional cost'
    const sub = clean(c.product_name) ? clean(c.description) : ''
    const dr = discountRate(0)
    items.push({
      Description: (sub ? `${label}\n${sub}` : label).slice(0, 4000),
      Quantity: 1,
      UnitAmount: n(c.amount),
      AccountCode: settings.purchases_account_code,
      TaxType: tax.type,
      ...(dr ? { DiscountRate: dr } : {}),
    })
  }
  if (problems.size) return fail(422, `${[...problems].slice(0, 3).join(' ')} Map ${problems.size === 1 ? 'it' : 'them'} in Settings → Integrations → Xero → Accounts and tax, then post again.`)
  if (items.length === 0) return fail(422, 'Nothing to bill: no received quantities on this order.')

  const date = (prefs.date_basis === 'created'
    ? day(order.order_date) || day(order.created_at)
    : day(order.received_date) || day(order.expected_date) || day(order.order_date)
  ) || new Date().toISOString().slice(0, 10)
  const days = dueInDays(clean(order.terms))
  const poNumber = clean(order.po_number)
  const body = {
    Invoices: [{
      Type: 'ACCPAY',
      Contact: { ContactID: contactId },
      Date: date,
      ...(days !== null ? { DueDate: addDays(date, days) } : {}),
      ...(poNumber ? { Reference: poNumber } : {}),
      ...(clean(order.currency) ? { CurrencyCode: clean(order.currency) } : {}),
      Status: prefs.bill_status,
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
    const msg = out?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this bill.'
    return fail(422, msg)
  }

  const xeroTotal = r2(n(out.Total))
  const diff = r2(xeroTotal - expectedTotal)
  const warning = Math.abs(diff) > 0.01 ? `Xero’s total is ${money(xeroTotal)} but the received total on the InventaHQ order is ${money(expectedTotal)} (difference ${money(Math.abs(diff))}). Check the bill in Xero.` : null
  await saveRecord(db, orgId, poId, {
    xero_id: out.InvoiceID, status: 'synced', error: warning,
    meta: { number: poNumber, total: expectedTotal, xero_total: xeroTotal, supplier: clean(order.supplier_name), date, status: prefs.bill_status },
  }, 'bill')
  return { ok: true, xeroId: out.InvoiceID, number: poNumber, url: xeroBillUrl(out.InvoiceID), warning, status: prefs.bill_status }
}

// ── Several at once ─────────────────────────────────────────────────────────

/** Closed purchase orders with something received. */
async function loadEligible(db: Db, orgId: string): Promise<{ id: string; po_number: string | null }[]> {
  const { data } = await db.from('purchase_orders')
    .select('id, po_number, purchase_order_lines ( quantity_ordered, quantity_received )')
    .eq('org_id', orgId).ilike('status', 'closed').order('created_at', { ascending: true })
  return ((data ?? []) as { id: string; po_number: string | null; purchase_order_lines: Row[] | null }[])
    .filter(o => hasReceived(o.purchase_order_lines ?? []))
    .map(o => ({ id: o.id, po_number: o.po_number }))
}

export async function postEligibleBills(db: Db, orgId: string, settings: XeroSettings, prefs: XeroPrefs, retryFailed = true, deadline = Infinity): Promise<BulkSummary> {
  const [eligible, { data: recs }] = await Promise.all([
    loadEligible(db, orgId),
    db.from('xero_sync_records').select('entity_id, status').eq('org_id', orgId).eq('entity', 'bill'),
  ])
  const done = new Set(((recs ?? []) as { entity_id: string; status: string }[]).filter(r => r.status === 'synced' || (!retryFailed && r.status === 'failed')).map(r => r.entity_id))
  const todo = eligible.filter(o => !done.has(o.id))

  const out: BulkSummary = { posted: 0, failed: 0, remaining: 0, failures: [] }
  const batch = todo.slice(0, MAX_BULK)
  for (let i = 0; i < batch.length; i++) {
    if (Date.now() > deadline) { out.remaining = todo.length - i; return out }
    const o = batch[i]
    const r = await postBill(db, orgId, o.id, settings, prefs)
    if (r.ok) out.posted++
    else {
      if (r.status === 429 || r.status === 401) { out.stopped = r.error; out.remaining = todo.length - out.posted - out.failed; return out }
      out.failed++
      out.failures.push({ id: o.id, name: o.po_number ?? 'Order', error: r.error })
    }
    if (i < batch.length - 1) await sleep(GAP_MS)
  }
  out.remaining = Math.max(0, todo.length - batch.length)
  return out
}

// ── Dashboard numbers (from Inventa only) ───────────────────────────────────

export type BillOverview = {
  eligible: number; posted: number; notPosted: number; failed: number
  failures: { id: string; name: string; error: string | null }[]
  waiting: { id: string; name: string }[]
  recent: { id: string; number: string; supplier: string; total: number; postedAt: string; url: string; warning: string | null }[]
  lastPostedAt: string | null
}

export async function billOverview(db: Db, orgId: string): Promise<BillOverview> {
  const [eligible, { data: names }, { data: recs }] = await Promise.all([
    loadEligible(db, orgId),
    db.from('purchase_orders').select('id, po_number').eq('org_id', orgId),
    db.from('xero_sync_records').select('entity_id, xero_id, status, error, synced_at, meta').eq('org_id', orgId).eq('entity', 'bill').order('synced_at', { ascending: false }),
  ])
  const nameOf = new Map(((names ?? []) as { id: string; po_number: string | null }[]).map(o => [o.id, o.po_number ?? 'Order']))
  const ids = new Set<string>(eligible.map(o => o.id))
  type Rec = { entity_id: string; xero_id: string | null; status: string; error: string | null; synced_at: string; meta: { number?: string; total?: number; supplier?: string } | null }
  const all = (recs ?? []) as Rec[]
  const posted = all.filter(r => r.status === 'synced')
  const postedIds = new Set(posted.map(r => r.entity_id))
  const failedRecs = all.filter(r => r.status === 'failed' && ids.has(r.entity_id) && !postedIds.has(r.entity_id))
  const failedIds = new Set(failedRecs.map(f => f.entity_id))
  return {
    eligible: ids.size,
    posted: [...ids].filter(id => postedIds.has(id)).length,
    notPosted: [...ids].filter(id => !postedIds.has(id) && !failedIds.has(id)).length,
    failed: failedRecs.length,
    failures: failedRecs.slice(0, 100).map(f => ({ id: f.entity_id, name: nameOf.get(f.entity_id) ?? 'Order', error: f.error })),
    waiting: [...ids].filter(id => !postedIds.has(id) && !failedIds.has(id)).slice(0, 100).map(id => ({ id, name: nameOf.get(id) ?? 'Order' })),
    recent: posted.slice(0, 5).map(r => ({
      id: r.entity_id, number: r.meta?.number || nameOf.get(r.entity_id) || '', supplier: r.meta?.supplier ?? '', total: Number(r.meta?.total ?? 0),
      postedAt: r.synced_at, url: r.xero_id ? xeroBillUrl(r.xero_id) : '', warning: r.error,
    })),
    lastPostedAt: posted[0]?.synced_at ?? null,
  }
}
