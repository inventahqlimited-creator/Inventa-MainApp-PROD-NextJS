// src/lib/xero/adjustment.ts
// Stock adjustments → manual journals in Xero (Draft or Posted, as chosen in Settings).
//   • Xero does NOT track inventory (the default): one manual journal per adjustment (below).
//   • Xero DOES track inventory: a Bill for the items that went up and a supplier Credit Note for the items that went down, each with one balancing
//     line on the stock adjustment account so it totals 0.00 (nothing owing). Xero then moves the quantity and value of its tracked items itself.
//     Only tracked stock items already in Xero are sent; others are skipped with a note. Cost = the cost saved on the line (else the product's average cost).
//   • Only a Completed adjustment, completed after the cut-off (prefs.adjust_from), not ticked "Don't send to Xero", and only once.
//   • Value = quantity change × the cost saved on the line. Lines with no cost use the product's average, last or cost price, which is then saved.
//   • Journal lines: the inventory asset account takes each product's value (gain = debit, loss = credit); one line on the stock adjustment account balances them.
//   • After posting, InventaHQ never touches the Xero copy again. A later change in InventaHQ is not sent.
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroGet, xeroPost } from './api'
import type { XeroSettings } from './mapping'
import type { XeroPrefs } from './prefs'
import { clean, n, saveRecord, sleep, type BulkSummary } from './invoice'

type Row = Record<string, unknown>
type Db = SupabaseClient
const MAX_BULK = 20
const GAP_MS = 1100

export const xeroJournalUrl = (xeroId: string) => `https://go.xero.com/Journal/View.aspx?invoiceID=${xeroId}`

export type JournalResult =
  | { ok: true; xeroId: string; number: string; url: string; warning: null; status: 'DRAFT' | 'POSTED' }
  | { ok: false; status: number; error: string; recorded?: boolean }

const day = (v: unknown) => (v ? String(v).slice(0, 10) : '')
const cents = (x: number) => Math.round((x + Number.EPSILON) * 100)
const MAP_MESSAGE = 'Choose the inventory asset and stock adjustment accounts in Settings → Integrations → Xero → Accounts and tax first.'

export const accountsMapped = (s: XeroSettings) => Boolean(s.inventory_account_code && s.adjustment_account_code)
/** What is needed before adjustments can be posted: tracked mode only needs the stock adjustment account (Xero knows each item's inventory account). */
export const adjustmentReady = (s: XeroSettings, prefs: XeroPrefs) => (prefs.inventory_tracked ? Boolean(s.adjustment_account_code) : accountsMapped(s))
const MAP_TRACKED = 'Choose the stock adjustment account in Settings → Integrations → Xero → Accounts and tax first.'
const mapMessage = (prefs: XeroPrefs) => (prefs.inventory_tracked ? MAP_TRACKED : MAP_MESSAGE)

// ── Tracked inventory: Bill (stock up) / Credit Note (stock down) ──
export type TrackedLine = { name: string; sku: string; unit: string; delta: number; cost: number }
export type TrackedDoc = { lines: { name: string; sku: string; unit: string; qty: number; cost: number; cents: number }[]; totalCents: number }

/** Splits adjustment lines into the Bill (increases) and the Credit Note (decreases). Each document's balancing amount is minus the sum of its item lines. */
export function buildTrackedDocs(lines: TrackedLine[]): { bill: TrackedDoc | null; credit: TrackedDoc | null } {
  const make = (up: boolean): TrackedDoc | null => {
    const ls = lines.filter(l => (up ? l.delta > 0 : l.delta < 0)).map(l => {
      const qty = Math.abs(l.delta)
      return { name: l.name, sku: l.sku, unit: l.unit, qty, cost: l.cost, cents: cents(qty * l.cost) }
    })
    return ls.length ? { lines: ls, totalCents: ls.reduce((s, l) => s + l.cents, 0) } : null
  }
  return { bill: make(true), credit: make(false) }
}

export const xeroBillUrl = (xeroId: string) => `https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=${xeroId}`
export const xeroCreditNoteUrl = (xeroId: string) => `https://go.xero.com/AccountsPayable/ViewCreditNote.aspx?creditNoteID=${xeroId}`

/** The stand-in supplier the adjustment documents are raised against: one per location, created in Xero the first time. */
async function adjustmentContact(db: Db, orgId: string, location: string): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const name = `${(location || 'Stock').replace(/["\\]/g, '').trim() || 'Stock'} – stock adjustments`.slice(0, 255)
  const found = await xeroGet<{ Contacts?: { ContactID: string; Name: string }[] }>(db, orgId, `/Contacts?where=${encodeURIComponent(`Name=="${name}"`)}&summaryOnly=true`)
  if (!found.ok) return found
  const hit = (found.data.Contacts ?? []).find(c => c.Name === name)
  if (hit) return { ok: true, id: hit.ContactID }
  const made = await xeroPost<{ Contacts?: { ContactID?: string; HasValidationErrors?: boolean; ValidationErrors?: { Message?: string }[] }[] }>(db, orgId, '/Contacts', { Contacts: [{ Name: name, IsSupplier: true }] })
  if (!made.ok) return made
  const c = made.data.Contacts?.[0]
  if (!c?.ContactID) return { ok: false, status: 422, error: c?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept the stock adjustment supplier.' }
  return { ok: true, id: c.ContactID }
}

/** The moment from which completed adjustments are posted. Stamped now the first time it is needed (new connections never back-post). */
export async function adjustCutoff(db: Db, orgId: string, prefs: XeroPrefs): Promise<string> {
  if (prefs.adjust_from) return prefs.adjust_from
  const stamp = new Date().toISOString()
  const { data } = await db.from('xero_connections').select('preferences').eq('org_id', orgId).maybeSingle()
  const cur = ((data as { preferences?: Record<string, unknown> } | null)?.preferences ?? {}) as Record<string, unknown>
  if (typeof cur.adjust_from === 'string' && cur.adjust_from) return cur.adjust_from
  await db.from('xero_connections').update({ preferences: { ...cur, adjust_from: stamp } }).eq('org_id', orgId)
  return stamp
}

/** Which cost to use for a product: average, then last purchase, then the cost price. */
const productCost = (p: Row) => [p.avg_cost, p.last_cost, p.cost_price].map(n).find(x => x > 0) ?? 0

export async function postAdjustment(db: Db, orgId: string, adjId: string, settings: XeroSettings, prefs: XeroPrefs): Promise<JournalResult> {
  if (!adjustmentReady(settings, prefs)) return { ok: false, status: 409, error: mapMessage(prefs) }

  const { data: adj } = await db.from('adjustment_orders')
    .select('id, adj_number, status, adjustment_date, completed_at, reason, notes, location_name, skip_xero')
    .eq('org_id', orgId).eq('id', adjId).maybeSingle()
  const a = adj as Row | null
  if (!a) return { ok: false, status: 404, error: 'Adjustment not found.' }
  if (String(a.status).toLowerCase() !== 'completed') return { ok: false, status: 409, error: 'Only completed stock adjustments can be posted to Xero.' }
  if (a.skip_xero === true) return { ok: false, status: 409, error: 'This adjustment is marked “Don’t send to Xero”.' }
  const cutoff = await adjustCutoff(db, orgId, prefs)
  if (!a.completed_at || Date.parse(String(a.completed_at)) < Date.parse(cutoff)) {
    return { ok: false, status: 409, error: 'This adjustment was completed before stock adjustments were switched on for Xero, so it isn’t posted.' }
  }

  const { data: existing } = await db.from('xero_sync_records').select('status').eq('org_id', orgId).eq('entity', 'adjustment').eq('entity_id', adjId).maybeSingle()
  if ((existing as { status?: string } | null)?.status === 'synced') return { ok: false, status: 409, error: 'This adjustment has already been posted to Xero.' }

  const fail = async (status: number, error: string): Promise<JournalResult> => {
    await saveRecord(db, orgId, adjId, { xero_id: null, status: 'failed', error }, 'adjustment')
    return { ok: false, status, error, recorded: true }
  }

  const { data: lineData } = await db.from('adjustment_order_lines')
    .select('id, product_id, product_name, product_sku, unit, quantity_before, quantity_after, unit_cost, sort_order')
    .eq('org_id', orgId).eq('adj_id', adjId)
  const lines = ((lineData ?? []) as Row[]).sort((x, y) => n(x.sort_order) - n(y.sort_order)).filter(l => n(l.quantity_after) - n(l.quantity_before) !== 0)
  if (lines.length === 0) return { ok: false, status: 409, error: 'Nothing to post: this adjustment has no quantity changes.' }

  // Lines saved without a cost take the product's current cost now, and keep it.
  const costOf = new Map<string, number>()
  const missing = lines.filter(l => n(l.unit_cost) <= 0 && clean(l.product_id))
  if (missing.length) {
    const { data: prods } = await db.from('products').select('id, avg_cost, last_cost, cost_price').eq('org_id', orgId).in('id', [...new Set(missing.map(l => clean(l.product_id)))])
    for (const p of (prods ?? []) as Row[]) costOf.set(String(p.id), productCost(p))
    for (const l of missing) {
      const c = costOf.get(clean(l.product_id)) ?? 0
      if (c > 0) { l.unit_cost = c; await db.from('adjustment_order_lines').update({ unit_cost: c }).eq('id', String(l.id)) }
    }
  }
  const noCost = lines.filter(l => n(l.unit_cost) <= 0).map(l => clean(l.product_name) || 'An item')
  if (noCost.length) {
    const names = [...new Set(noCost)]
    return fail(422, `No cost found for ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. Add a cost price to ${names.length === 1 ? 'the product' : 'the products'} in InventaHQ, then post again.`)
  }

  const number = clean(a.adj_number)
  if (prefs.inventory_tracked) return postTracked(db, orgId, a, lines, number, settings, prefs, fail)
  const unitWord = (l: Row) => clean(l.unit)
  const journalLines: { LineAmount: number; AccountCode: string; Description: string; TaxType: string }[] = []
  let totalCents = 0
  for (const l of lines) {
    const delta = n(l.quantity_after) - n(l.quantity_before)
    const value = cents(delta * n(l.unit_cost))
    if (value === 0) continue
    totalCents += value
    const sku = clean(l.product_sku)
    const desc = `${number ? `${number} · ` : ''}${clean(l.product_name) || 'Item'}${sku ? ` (${sku})` : ''}: ${delta > 0 ? '+' : ''}${delta}${unitWord(l) ? ` ${unitWord(l)}` : ''} at ${n(l.unit_cost).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
    journalLines.push({ LineAmount: value / 100, AccountCode: settings.inventory_account_code as string, Description: desc.slice(0, 400), TaxType: 'NONE' })
  }
  if (journalLines.length === 0) return { ok: false, status: 409, error: 'Nothing to post: the value of this adjustment is zero.' }
  // One line on the adjustment account balances the journal (a gain credits it, a loss debits it).
  if (totalCents !== 0) {
    journalLines.push({ LineAmount: -totalCents / 100, AccountCode: settings.adjustment_account_code as string, Description: `${number ? `${number} · ` : ''}Stock adjustment${clean(a.reason) ? ` (${clean(a.reason)})` : ''}`.slice(0, 400), TaxType: 'NONE' })
  }

  const date = day(a.adjustment_date) || day(a.completed_at) || new Date().toISOString().slice(0, 10)
  const where = clean(a.location_name)
  const narration = `Stock adjustment ${number}${clean(a.reason) ? ` · ${clean(a.reason)}` : ''}${where ? ` · ${where}` : ''}`.trim().slice(0, 450)
  const body = { ManualJournals: [{ Narration: narration, Date: date, Status: prefs.journal_status, LineAmountTypes: 'NoTax', JournalLines: journalLines }] }

  const res = await xeroPost<{ ManualJournals?: { ManualJournalID?: string; HasErrors?: boolean; ValidationErrors?: { Message?: string }[] }[] }>(db, orgId, '/ManualJournals', body)
  if (!res.ok) return res.status === 429 || res.status === 401 ? { ok: false, status: res.status, error: res.error } : fail(res.status === 400 ? 422 : 502, res.error)

  const out = res.data.ManualJournals?.[0]
  if (!out?.ManualJournalID || out.HasErrors) {
    return fail(422, out?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this journal.')
  }

  await saveRecord(db, orgId, adjId, {
    xero_id: out.ManualJournalID, status: 'synced', error: null,
    meta: { number, total: totalCents / 100, location: where, date, status: prefs.journal_status },
  }, 'adjustment')
  return { ok: true, xeroId: out.ManualJournalID, number, url: xeroJournalUrl(out.ManualJournalID), warning: null, status: prefs.journal_status }
}

/** Tracked inventory: post the Bill and / or Credit Note. A retry after a half-finished post only sends the part that is missing. */
async function postTracked(db: Db, orgId: string, a: Row, lines: Row[], number: string, settings: XeroSettings, prefs: XeroPrefs, fail: (status: number, error: string) => Promise<JournalResult>): Promise<JournalResult> {
  const adjId = String(a.id)
  // only tracked stock items that are already in Xero can move Xero's stock
  const ids = [...new Set(lines.map(l => clean(l.product_id)).filter(Boolean))]
  const stock = new Set<string>(), inXero = new Set<string>()
  if (ids.length) {
    const [{ data: prods }, { data: recs }] = await Promise.all([
      db.from('products').select('id, type, track_stock').eq('org_id', orgId).in('id', ids),
      db.from('xero_sync_records').select('entity_id').eq('org_id', orgId).eq('entity', 'product').eq('status', 'synced').in('entity_id', ids),
    ])
    for (const p of (prods ?? []) as Row[]) if (p.type === 'Stock' && p.track_stock !== false) stock.add(String(p.id))
    for (const r of (recs ?? []) as Row[]) inXero.add(String(r.entity_id))
  }
  const sendable = lines.filter(l => stock.has(clean(l.product_id)) && inXero.has(clean(l.product_id)) && clean(l.product_sku))
  const skipped = [...new Set(lines.filter(l => !sendable.includes(l)).map(l => clean(l.product_name) || 'An item'))]
  const skipNote = skipped.length ? `Not sent to Xero (not a tracked stock item in Xero): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ` and ${skipped.length - 5} more` : ''}.` : null
  const where = clean(a.location_name)
  const date = day(a.adjustment_date) || day(a.completed_at) || new Date().toISOString().slice(0, 10)
  const status: 'DRAFT' | 'AUTHORISED' = prefs.journal_status === 'POSTED' ? 'AUTHORISED' : 'DRAFT'

  if (sendable.length === 0) {
    const note = `Nothing was sent to Xero: none of the items on this adjustment are tracked stock items in Xero.`
    await saveRecord(db, orgId, adjId, { xero_id: null, status: 'synced', error: note, meta: { number, total: 0, location: where, date, status: prefs.journal_status, none: true } }, 'adjustment')
    return { ok: true, xeroId: '', number, url: '', warning: null, status: prefs.journal_status }
  }

  const docs = buildTrackedDocs(sendable.map(l => ({ name: clean(l.product_name) || 'Item', sku: clean(l.product_sku), unit: clean(l.unit), delta: n(l.quantity_after) - n(l.quantity_before), cost: n(l.unit_cost) })))
  const { data: prev } = await db.from('xero_sync_records').select('meta').eq('org_id', orgId).eq('entity', 'adjustment').eq('entity_id', adjId).maybeSingle()
  const done = ((prev as { meta?: { bill_id?: string; credit_id?: string } } | null)?.meta ?? {}) as { bill_id?: string; credit_id?: string }
  let billId = done.bill_id ?? null, creditId = done.credit_id ?? null

  const contact = await adjustmentContact(db, orgId, where)
  if (!contact.ok) return contact.status === 429 || contact.status === 401 ? { ok: false, status: contact.status, error: contact.error } : fail(502, `Could not set up the Xero supplier for stock adjustments. ${contact.error}`)

  const narration = `Stock adjustment ${number}${clean(a.reason) ? ` · ${clean(a.reason)}` : ''}${where ? ` · ${where}` : ''}`.trim().slice(0, 250)
  const lineItems = (d: TrackedDoc) => [
    ...d.lines.map(l => ({
      Description: `${number ? `${number} · ` : ''}${l.name}`.slice(0, 400), Quantity: l.qty, UnitAmount: l.cost, ItemCode: l.sku, TaxType: 'NONE',
    })),
    // the balancing line: same value the other way, so the document totals 0.00
    { Description: `${number ? `${number} · ` : ''}Stock adjustment${clean(a.reason) ? ` (${clean(a.reason)})` : ''}`.slice(0, 400), Quantity: 1, UnitAmount: -d.totalCents / 100, AccountCode: settings.adjustment_account_code as string, TaxType: 'NONE' },
  ]
  const progress = (extra: Record<string, unknown> = {}) => ({ number, location: where, date, status: prefs.journal_status, bill_id: billId, credit_id: creditId, ...extra })
  const failKeep = async (code: number, error: string): Promise<JournalResult> => {
    await saveRecord(db, orgId, adjId, { xero_id: null, status: 'failed', error, meta: progress() }, 'adjustment')
    return { ok: false, status: code, error, recorded: true }
  }
  type Reply = { InvoiceID?: string; CreditNoteID?: string; Total?: number; HasErrors?: boolean; ValidationErrors?: { Message?: string }[] }
  let warning: string | null = skipNote

  if (docs.bill && !billId) {
    const res = await xeroPost<{ Invoices?: Reply[] }>(db, orgId, '/Invoices?summarizeErrors=false&unitdp=4', {
      Invoices: [{ Type: 'ACCPAY', Contact: { ContactID: contact.id }, Date: date, DueDate: date, ...(number ? { InvoiceNumber: number } : {}), Reference: narration, Status: status, LineAmountTypes: 'NoTax', LineItems: lineItems(docs.bill) }],
    })
    if (!res.ok) return res.status === 429 || res.status === 401 ? { ok: false, status: res.status, error: res.error } : failKeep(res.status === 400 ? 422 : 502, res.error)
    const out = res.data.Invoices?.[0]
    if (!out?.InvoiceID || out.HasErrors) return failKeep(422, out?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this bill.')
    billId = out.InvoiceID
    if (Math.abs(n(out.Total)) > 0.011) warning = `${warning ? `${warning} ` : ''}The bill in Xero totals ${n(out.Total).toFixed(2)} instead of 0.00. Check it in Xero.`
  }
  if (docs.credit && !creditId) {
    const res = await xeroPost<{ CreditNotes?: Reply[] }>(db, orgId, '/CreditNotes?summarizeErrors=false&unitdp=4', {
      CreditNotes: [{ Type: 'ACCPAYCREDIT', Contact: { ContactID: contact.id }, Date: date, ...(number ? { CreditNoteNumber: number } : {}), Reference: narration, Status: status, LineAmountTypes: 'NoTax', LineItems: lineItems(docs.credit) }],
    })
    if (!res.ok) return res.status === 429 || res.status === 401 ? { ok: false, status: res.status, error: res.error } : failKeep(res.status === 400 ? 422 : 502, res.error)
    const out = res.data.CreditNotes?.[0]
    if (!out?.CreditNoteID || out.HasErrors) return failKeep(422, out?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this credit note.')
    creditId = out.CreditNoteID
    if (Math.abs(n(out.Total)) > 0.011) warning = `${warning ? `${warning} ` : ''}The credit note in Xero totals ${n(out.Total).toFixed(2)} instead of 0.00. Check it in Xero.`
  }

  const url = billId ? xeroBillUrl(billId) : creditId ? xeroCreditNoteUrl(creditId) : ''
  const value = ((docs.bill?.totalCents ?? 0) - (docs.credit?.totalCents ?? 0)) / 100
  await saveRecord(db, orgId, adjId, { xero_id: billId ?? creditId, status: 'synced', error: warning, meta: progress({ total: value, url }) }, 'adjustment')
  return { ok: true, xeroId: (billId ?? creditId) as string, number, url, warning: null, status: prefs.journal_status }
}

// ── Several at once ─────────────────────────────────────────────────────────

/** Completed, after the cut-off, not ticked "Don't send", with at least one quantity change. */
async function loadEligible(db: Db, orgId: string, cutoff: string): Promise<{ id: string; adj_number: string | null }[]> {
  const { data } = await db.from('adjustment_orders')
    .select('id, adj_number, adjustment_order_lines:adjustment_order_lines ( quantity_before, quantity_after )')
    .eq('org_id', orgId).ilike('status', 'completed').eq('skip_xero', false).gte('completed_at', cutoff).order('completed_at', { ascending: true })
  return ((data ?? []) as unknown as { id: string; adj_number: string | null; adjustment_order_lines: Row[] | null }[])
    .filter(o => (o.adjustment_order_lines ?? []).some(l => n(l.quantity_after) - n(l.quantity_before) !== 0))
    .map(o => ({ id: o.id, adj_number: o.adj_number }))
}

export async function postEligibleAdjustments(db: Db, orgId: string, settings: XeroSettings, prefs: XeroPrefs, retryFailed = true, deadline = Infinity): Promise<BulkSummary & { note?: string }> {
  const out: BulkSummary & { note?: string } = { posted: 0, failed: 0, remaining: 0, failures: [] }
  if (!adjustmentReady(settings, prefs)) return { ...out, note: mapMessage(prefs) }

  const cutoff = await adjustCutoff(db, orgId, prefs)
  const [eligible, { data: recs }] = await Promise.all([
    loadEligible(db, orgId, cutoff),
    db.from('xero_sync_records').select('entity_id, status').eq('org_id', orgId).eq('entity', 'adjustment'),
  ])
  const done = new Set(((recs ?? []) as { entity_id: string; status: string }[]).filter(r => r.status === 'synced' || (!retryFailed && r.status === 'failed')).map(r => r.entity_id))
  const todo = eligible.filter(o => !done.has(o.id))

  const batch = todo.slice(0, MAX_BULK)
  for (let i = 0; i < batch.length; i++) {
    if (Date.now() > deadline) { out.remaining = todo.length - i; return out }
    const o = batch[i]
    const r = await postAdjustment(db, orgId, o.id, settings, prefs)
    if (r.ok) out.posted++
    else {
      if (r.status === 429 || r.status === 401) { out.stopped = r.error; out.remaining = todo.length - out.posted - out.failed; return out }
      out.failed++
      out.failures.push({ id: o.id, name: o.adj_number ?? 'Adjustment', error: r.error })
    }
    if (i < batch.length - 1) await sleep(GAP_MS)
  }
  out.remaining = Math.max(0, todo.length - batch.length)
  return out
}

// ── Dashboard numbers (from InventaHQ only) ─────────────────────────────────

export type AdjustmentOverview = {
  tracked: boolean                      // Xero tracks inventory: nothing is sent, adjustments are posted in Xero by hand
  needsAccounts: boolean                // the two accounts aren't chosen yet
  eligible: number; posted: number; notPosted: number; failed: number
  skipped: number                       // ticked "Don't send to Xero"
  failures: { id: string; name: string; error: string | null }[]
  waiting: { id: string; name: string }[]
  manual: { id: string; name: string }[] // completed since the cut-off: to post in Xero by hand (tracked mode)
  manualCount: number
  recent: { id: string; number: string; location: string; total: number; postedAt: string; url: string; warning: string | null }[]
  lastPostedAt: string | null
}

export async function adjustmentOverview(db: Db, orgId: string, settings: XeroSettings, prefs: XeroPrefs): Promise<AdjustmentOverview> {
  const cutoff = await adjustCutoff(db, orgId, prefs)
  const { data: all } = await db.from('adjustment_orders')
    .select('id, adj_number, skip_xero, adjustment_order_lines:adjustment_order_lines ( quantity_before, quantity_after )')
    .eq('org_id', orgId).ilike('status', 'completed').gte('completed_at', cutoff).order('completed_at', { ascending: false })
  const done = ((all ?? []) as unknown as { id: string; adj_number: string | null; skip_xero: boolean; adjustment_order_lines: Row[] | null }[])
    .filter(o => (o.adjustment_order_lines ?? []).some(l => n(l.quantity_after) - n(l.quantity_before) !== 0))
  const nameOf = new Map(done.map(o => [o.id, o.adj_number ?? 'Adjustment']))

  const base = { tracked: false, needsAccounts: !adjustmentReady(settings, prefs) }

  const skipped = done.filter(o => o.skip_xero)
  const eligible = done.filter(o => !o.skip_xero)
  const ids = new Set(eligible.map(o => o.id))
  const { data: recs } = await db.from('xero_sync_records').select('entity_id, xero_id, status, error, synced_at, meta').eq('org_id', orgId).eq('entity', 'adjustment').order('synced_at', { ascending: false })
  type Rec = { entity_id: string; xero_id: string | null; status: string; error: string | null; synced_at: string; meta: { number?: string; total?: number; location?: string; url?: string } | null }
  const records = (recs ?? []) as Rec[]
  const posted = records.filter(r => r.status === 'synced')
  const postedIds = new Set(posted.map(r => r.entity_id))
  const failedRecs = records.filter(r => r.status === 'failed' && ids.has(r.entity_id) && !postedIds.has(r.entity_id))
  const failedIds = new Set(failedRecs.map(f => f.entity_id))
  const waiting = [...ids].filter(id => !postedIds.has(id) && !failedIds.has(id))
  return {
    ...base,
    eligible: ids.size,
    posted: [...ids].filter(id => postedIds.has(id)).length,
    notPosted: waiting.length,
    failed: failedRecs.length,
    skipped: skipped.length,
    failures: failedRecs.slice(0, 100).map(f => ({ id: f.entity_id, name: nameOf.get(f.entity_id) ?? 'Adjustment', error: f.error })),
    waiting: waiting.slice(0, 100).map(id => ({ id, name: nameOf.get(id) ?? 'Adjustment' })),
    manual: [], manualCount: 0,
    recent: posted.slice(0, 5).map(r => ({
      id: r.entity_id, number: r.meta?.number || nameOf.get(r.entity_id) || '', location: r.meta?.location ?? '', total: Number(r.meta?.total ?? 0),
      postedAt: r.synced_at, url: r.meta?.url || (r.xero_id ? xeroJournalUrl(r.xero_id) : ''), warning: r.error,
    })),
    lastPostedAt: posted[0]?.synced_at ?? null,
  }
}
