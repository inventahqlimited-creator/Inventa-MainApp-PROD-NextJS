// src/lib/xero/credit-note.ts
// Closed credit notes (Sales Returns) → customer credit notes in Xero (Draft or Authorised, as chosen in Settings → Sales → Credit Notes).
//   • Posted when the credit note is closed, and again on request (Retry) if Xero refused it.
//   • Price, discount and tax are those of the original order; the credit note's Reference is the original invoice number.
//   • Inventa does not allocate the credit note to the invoice or refund it: that is done in Xero.
//   • A failure never undoes the stock that came back. It is recorded (xero_sync_records, entity credit_note) and can be retried.
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroPost } from './api'
import { runSync } from './sync'
import { normalizePrefs, type XeroPrefs } from './prefs'
import type { XeroSettings } from './mapping'
import { clean, friendlyXeroError, n, r2, saveRecord, taxTypeFor, money } from './invoice'
import { logXero } from './audit'
import { loadSettings } from '@/lib/credit-notes/server'

type Db = SupabaseClient
type Row = Record<string, unknown>
const r4 = (x: number) => Math.round((x + Number.EPSILON) * 10000) / 10000

export type CreditNotePost =
  | { state: 'posted'; number: string; url: string; status: 'DRAFT' | 'AUTHORISED'; warning: string | null }
  | { state: 'failed'; error: string; status?: number }
  | { state: 'skipped'; reason: string }

export const xeroCreditNoteUrl = (xeroId: string) => `https://go.xero.com/AccountsReceivable/ViewCreditNote.aspx?creditNoteID=${xeroId}`

export async function postCreditNote(db: Db, orgId: string, cnId: string, settings: XeroSettings, prefs: XeroPrefs): Promise<CreditNotePost> {
  if (!settings.sales_account_code || !settings.purchases_account_code) {
    return { state: 'failed', status: 409, error: 'Save the Accounts and tax settings in Xero settings before posting credit notes.' }
  }
  const { data } = await db.from('credit_notes').select('*, credit_note_lines(*)').eq('org_id', orgId).eq('id', cnId).maybeSingle()
  const cn = data as (Row & { credit_note_lines?: Row[] }) | null
  if (!cn) return { state: 'failed', status: 404, error: 'Credit note not found.' }
  if (cn.status !== 'Closed') return { state: 'failed', status: 409, error: 'Only closed credit notes can be posted to Xero.' }

  const { data: existing } = await db.from('xero_sync_records').select('status').eq('org_id', orgId).eq('entity', 'credit_note').eq('entity_id', cnId).maybeSingle()
  if ((existing as { status?: string } | null)?.status === 'synced') return { state: 'failed', status: 409, error: 'This credit note has already been posted to Xero.' }

  const fail = async (status: number, error: string): Promise<CreditNotePost> => {
    await saveRecord(db, orgId, cnId, { xero_id: null, status: 'failed', error }, 'credit_note')
    await logXero(db, orgId, { action: 'Xero Post Failed', ref: clean(cn.cn_number), entity_type: 'sales_orders', entity_id: clean(cn.so_id), detail: `Could not send credit note ${clean(cn.cn_number)} to Xero · ${error}` })
    return { state: 'failed', status, error }
  }

  const customerId = clean(cn.customer_id)
  if (!customerId) return fail(409, 'This credit note has no customer.')
  const contactLink = async () => {
    const { data: d } = await db.from('xero_sync_records').select('xero_id, status').eq('org_id', orgId).eq('entity', 'contact').eq('entity_id', customerId).maybeSingle()
    const l = d as { xero_id: string | null; status: string } | null
    return l?.status === 'synced' ? l.xero_id : null
  }
  let contactId = await contactLink()
  if (!contactId) {
    const r = await runSync(db, orgId, 'contact', { ids: [customerId], settings })
    if (!r.ok) return r.status === 429 || r.status === 401 ? { state: 'failed', status: r.status, error: r.error } : fail(502, `Could not post the customer to Xero first. ${r.error}`)
    contactId = await contactLink()
    if (!contactId) return fail(422, `Could not post the customer to Xero first. ${r.summary.failures[0]?.error ?? ''}`.trim())
  }

  const lines = [...(cn.credit_note_lines ?? [])].sort((a, b) => n(a.sort_order) - n(b.sort_order))
  const productIds = [...new Set(lines.map(l => clean(l.product_id)).filter(Boolean))]
  const synced = new Set<string>()
  if (productIds.length) {
    const { data: d } = await db.from('xero_sync_records').select('entity_id').eq('org_id', orgId).eq('entity', 'product').eq('status', 'synced').in('entity_id', productIds)
    for (const r of (d ?? []) as { entity_id: string }[]) synced.add(r.entity_id)
  }
  const { data: taxData } = await db.from('tax_rates').select('id, name, rate').eq('org_id', orgId)
  const rates = ((taxData ?? []) as { id: string; name: string; rate: number | string }[]).map(r => ({ id: r.id, name: r.name, rate: n(r.rate) }))

  const problems = new Set<string>()
  const items: Record<string, unknown>[] = []
  for (const l of lines) {
    const price = n(l.unit_price)
    const code = clean(l.product_sku)
    const itemSynced = synced.has(clean(l.product_id)) && !!code
    // kit items carry no price: only send them when Xero tracks stock, so the stock comes back there too (at $0, like the invoice)
    if (price === 0 && !(prefs.inventory_tracked && itemSynced)) continue
    const tax = taxTypeFor(settings, rates, l.tax_rate_id, l.tax_rate)
    if ('error' in tax) { if (price !== 0) problems.add(tax.error); continue }
    const dr = r4(n(l.discount))
    const note = [clean(l.serial_number) ? `Serial ${clean(l.serial_number)}` : '', clean(l.batch_number) ? `Batch ${clean(l.batch_number)}` : ''].filter(Boolean).join(' · ')
    const name = clean(l.product_name) || 'Item'
    items.push({
      Description: (note ? `${name}\n${note}` : name).slice(0, 4000),
      Quantity: n(l.quantity), UnitAmount: price, AccountCode: settings.sales_account_code, TaxType: tax.type,
      ...(dr > 0 ? { DiscountRate: Math.min(dr, 100) } : {}),
      ...(itemSynced ? { ItemCode: code } : {}),
    })
  }
  if (problems.size) return fail(422, `${[...problems].slice(0, 3).join(' ')} Map ${problems.size === 1 ? 'it' : 'them'} in Settings → Integrations → Xero → Accounts and tax, then post again.`)
  if (items.length === 0) return fail(422, 'Nothing to credit: no priced lines on this credit note.')

  const cnSettings = await loadSettings(db, orgId)
  const date = clean(cn.return_date).slice(0, 10) || new Date().toISOString().slice(0, 10)
  const body = {
    CreditNotes: [{
      Type: 'ACCRECCREDIT', Contact: { ContactID: contactId }, Date: date,
      CreditNoteNumber: clean(cn.cn_number),
      ...(clean(cn.invoice_number) ? { Reference: clean(cn.invoice_number) } : {}),
      ...(clean(cn.currency) ? { CurrencyCode: clean(cn.currency) } : {}),
      Status: cnSettings.xero_status, LineAmountTypes: 'Exclusive', LineItems: items,
    }],
  }
  const itemNames = lines.map(l => clean(l.product_name))
  const res = await xeroPost<{ CreditNotes?: { CreditNoteID?: string; CreditNoteNumber?: string; Total?: number; HasErrors?: boolean; ValidationErrors?: { Message?: string }[] }[] }>(
    db, orgId, '/CreditNotes?summarizeErrors=false&unitdp=4', body,
  )
  if (!res.ok) return res.status === 429 || res.status === 401 ? { state: 'failed', status: res.status, error: res.error } : fail(res.status === 400 ? 422 : 502, friendlyXeroError(prefs, res.error, itemNames))
  const out = res.data.CreditNotes?.[0]
  if (!out?.CreditNoteID || out.HasErrors) {
    const msg = out?.ValidationErrors?.map(e => e.Message).filter(Boolean).join(' ') || 'Xero did not accept this credit note.'
    return fail(422, friendlyXeroError(prefs, msg, itemNames))
  }

  const xeroTotal = r2(n(out.Total))
  const ours = r2(n(cn.total_amount))
  const warning = Math.abs(xeroTotal - ours) > 0.01 ? `Xero’s total is ${money(xeroTotal)} but the InventaHQ credit note total is ${money(ours)}. Check it in Xero.` : null
  const number = clean(out.CreditNoteNumber) || clean(cn.cn_number)
  await saveRecord(db, orgId, cnId, {
    xero_id: out.CreditNoteID, status: 'synced', error: warning,
    meta: { number, total: ours, xero_total: xeroTotal, customer: clean(cn.customer_name), date, status: cnSettings.xero_status },
  }, 'credit_note')
  await logXero(db, orgId, { action: 'Posted to Xero', ref: number, entity_type: 'sales_orders', entity_id: clean(cn.so_id), detail: `Credit note ${number} sent to Xero as ${cnSettings.xero_status === 'AUTHORISED' ? 'approved' : 'draft'}` })
  return { state: 'posted', number, url: xeroCreditNoteUrl(out.CreditNoteID), status: cnSettings.xero_status, warning }
}

/** Used when a credit note is closed: posts it if Xero is switched on and connected, otherwise says it was skipped. */
export async function postCreditNoteIfConnected(db: Db, orgId: string, cnId: string): Promise<CreditNotePost> {
  try {
    const { data: org } = await db.from('organisations').select('xero_enabled').eq('id', orgId).single()
    if (!(org as { xero_enabled?: boolean | null } | null)?.xero_enabled) return { state: 'skipped', reason: 'Xero is not switched on.' }
    const { data } = await db.from('xero_connections').select('status, settings, preferences').eq('org_id', orgId).maybeSingle()
    const row = data as { status: string; settings: XeroSettings | null; preferences: unknown } | null
    if (!row || row.status !== 'connected') return { state: 'skipped', reason: 'Xero is not connected.' }
    const prefs = normalizePrefs(row.preferences)
    if (prefs.scope === 'contacts_products' || prefs.scope === 'adjustments') return { state: 'skipped', reason: 'Xero is set to sync other records only.' }
    return await postCreditNote(db, orgId, cnId, row.settings ?? {}, prefs)
  } catch (e) {
    return { state: 'failed', error: e instanceof Error ? e.message : 'Could not post to Xero.' }
  }
}
