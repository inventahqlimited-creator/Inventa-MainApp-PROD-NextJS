// src/lib/credit-notes/server.ts
// Server side of Sales Returns: building credit note lines from the original order (with every check), numbering, and
// the print payload. A credit note can only be raised against a Closed sales order, and never for more than shipped.
import type { SupabaseClient } from '@supabase/supabase-js'
import { business, billTo, clean, num, r2, type ContactDb, type OrgDb } from '@/lib/invoice/data'
import { loadInvoicePayload } from '@/lib/invoice/data'
import type { InvoiceLine, InvoiceOrder, InvoicePayload, InvoiceTax } from '@/lib/invoice/types'
import { qtyFmtFromOrg } from '@/lib/qty'
import { creditLineTotal, formatCreditNoteNumber, normalizeCreditNoteSettings, type CnLineInput, type CreditNoteSettings } from './config'

type Db = SupabaseClient
type Row = Record<string, unknown>

export async function loadSettings(db: Db, orgId: string): Promise<CreditNoteSettings> {
  const { data } = await db.from('organisations').select('credit_note_settings').eq('id', orgId).single()
  return normalizeCreditNoteSettings((data as { credit_note_settings?: unknown } | null)?.credit_note_settings)
}

export async function nextCreditNoteNumber(db: Db, orgId: string, s: CreditNoteSettings): Promise<string> {
  const { data, error } = await db.from('credit_notes').select('cn_number').eq('org_id', orgId)
  if (error) throw new Error(error.message)
  return formatCreditNoteNumber(s, ((data ?? []) as { cn_number: string }[]).map(r => r.cn_number))
}

/** How much of each order line is already on another Open or Closed credit note. */
export async function returnedByLine(db: Db, orgId: string, soId: string, excludeCn?: string): Promise<Map<string, number>> {
  const { data: cns } = await db.from('credit_notes').select('id').eq('org_id', orgId).eq('so_id', soId).in('status', ['Open', 'Closed'])
  const ids = ((cns ?? []) as { id: string }[]).map(c => c.id).filter(id => id !== excludeCn)
  const out = new Map<string, number>()
  if (!ids.length) return out
  const { data } = await db.from('credit_note_lines').select('so_line_id, quantity').in('cn_id', ids)
  for (const r of (data ?? []) as { so_line_id: string | null; quantity: number }[]) if (r.so_line_id) out.set(r.so_line_id, (out.get(r.so_line_id) ?? 0) + num(r.quantity))
  return out
}

/** Serials (as "product_id|serial") already on another Open or Closed credit note for this order, so they can't be returned twice. */
export async function takenSerials(db: Db, orgId: string, soId: string, excludeCn?: string): Promise<Set<string>> {
  const { data } = await db.from('credit_note_lines').select('product_id, serial_number, cn_id, credit_notes!inner(so_id, status)').eq('org_id', orgId).not('serial_number', 'is', null)
  return new Set(
    ((data ?? []) as unknown as { product_id: string; serial_number: string; cn_id: string; credit_notes: { so_id: string; status: string } | { so_id: string; status: string }[] }[])
      .filter(r => { const c = Array.isArray(r.credit_notes) ? r.credit_notes[0] : r.credit_notes; return c && c.so_id === soId && ['Open', 'Closed'].includes(c.status) && r.cn_id !== excludeCn })
      .map(r => `${r.product_id}|${r.serial_number}`),
  )
}

export type CnOrder = {
  id: string; so_number: string | null; status: string; customer_id: string | null; customer_name: string | null
  location_id: string | null; currency: string | null
  order_discount: number | null; order_discount_type: string | null
}

export async function loadClosedOrder(db: Db, orgId: string, soId: string): Promise<{ order: CnOrder; lines: Row[]; costsTotal: number } | { error: string; status: number }> {
  const { data: so } = await db.from('sales_orders').select('id, so_number, status, customer_id, customer_name, location_id, currency, order_discount, order_discount_type').eq('org_id', orgId).eq('id', soId).maybeSingle()
  if (!so) return { error: 'Sales order not found.', status: 404 }
  const order = so as CnOrder
  if (String(order.status).toLowerCase() !== 'closed') return { error: 'A credit note can only be raised against a closed sales order.', status: 409 }
  const [{ data: lines }, { data: costs }] = await Promise.all([
    db.from('sales_order_lines').select('id, product_id, product_name, product_sku, unit, quantity, quantity_shipped, unit_price, discount, tax_rate, tax_rate_id, tax_name, is_kit_parent, sort_order').eq('so_id', soId).order('sort_order'),
    db.from('sales_order_cost_lines').select('amount').eq('so_id', soId),
  ])
  const costsTotal = ((costs ?? []) as { amount: number }[]).reduce((s, c) => s + num(c.amount), 0)
  return { order, lines: (lines ?? []) as Row[], costsTotal }
}

/** Serials, batches and bins that actually went out on this order (from its sale stock movements), per product. */
export type SoldTracking = { serials: Set<string>; batches: Set<string> }
export async function soldTracking(db: Db, orgId: string, soId: string): Promise<Map<string, SoldTracking>> {
  const { data } = await db.from('stock_movements').select('product_id, serial_number, batch_number')
    .eq('org_id', orgId).eq('reference_id', soId).eq('reference_type', 'sales_order').eq('movement_type', 'sale')
  const out = new Map<string, SoldTracking>()
  for (const r of (data ?? []) as { product_id: string; serial_number: string | null; batch_number: string | null }[]) {
    const t = out.get(r.product_id) ?? { serials: new Set<string>(), batches: new Set<string>() }
    if (r.serial_number) t.serials.add(r.serial_number)
    if (r.batch_number) t.batches.add(r.batch_number)
    out.set(r.product_id, t)
  }
  return out
}

/** The order-level discount comes off every line (same maths as the printed invoice): a line keeps this share of its price. */
export function discountFactor(order: Pick<CnOrder, 'order_discount' | 'order_discount_type'>, lines: Row[], costsTotal: number): number {
  const pre = lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_price) * (1 - num(l.discount) / 100), 0) + costsTotal
  const discValue = num(order.order_discount)
  const discAmt = pre <= 0 ? 0 : order.order_discount_type === '%' ? pre * (discValue / 100) : Math.min(discValue, pre)
  return pre > 0 ? (pre - discAmt) / pre : 1
}

/** Validates what the person chose to return and turns it into credit note line rows (price, discount and tax copied from the order). */
export async function buildLines(
  db: Db, orgId: string, soId: string, inputs: CnLineInput[], locationId: string, excludeCn?: string,
): Promise<{ rows: Row[]; total: number } | { error: string; status: number }> {
  const loaded = await loadClosedOrder(db, orgId, soId)
  if ('error' in loaded) return loaded
  const { order, lines, costsTotal } = loaded
  if (!Array.isArray(inputs) || inputs.length === 0) return { error: 'Add at least one item to return.', status: 400 }

  const byId = new Map(lines.map(l => [String(l.id), l]))
  const returned = await returnedByLine(db, orgId, soId, excludeCn)
  const productIds = [...new Set(lines.map(l => String(l.product_id)))]
  const [{ data: prods }, sold, { data: bins }, taken] = await Promise.all([
    db.from('products').select('id, serial_tracking, batch_tracking, track_stock, type').in('id', productIds),
    soldTracking(db, orgId, soId),
    db.from('bins').select('id').eq('org_id', orgId).eq('location_id', locationId),
    takenSerials(db, orgId, soId, excludeCn),
  ])
  const prodById = new Map(((prods ?? []) as Row[]).map(p => [String(p.id), p]))
  const binIds = new Set(((bins ?? []) as { id: string }[]).map(b => String(b.id)))

  const factor = discountFactor(order, lines, costsTotal)

  const mine = new Map<string, number>()
  const seenSerial = new Set<string>()
  const rows: Row[] = []
  for (const [i, inp] of inputs.entries()) {
    const sl = byId.get(String(inp.so_line_id))
    if (!sl) return { error: 'One of the lines isn’t on the original order.', status: 400 }
    const qty = num(inp.quantity)
    const name = String(sl.product_name ?? 'Item')
    if (!(qty > 0)) return { error: `Enter a quantity to return for ${name}.`, status: 400 }
    const p = prodById.get(String(sl.product_id)) ?? {}
    const t = sold.get(String(sl.product_id))
    const serial = clean(inp.serial_number) || null
    const batch = clean(inp.batch_number) || null
    const bin = clean(inp.bin_id) || null
    if (bin && !binIds.has(bin)) return { error: `The bin chosen for ${name} isn’t in the return location.`, status: 400 }
    const isStock = p.track_stock !== false && p.type !== 'Service' && !sl.is_kit_parent
    if (isStock && p.serial_tracking) {
      if (!serial) return { error: `Choose the serial number being returned for ${name}.`, status: 400 }
      if (!t?.serials.has(serial)) return { error: `Serial ${serial} wasn’t shipped on this order (${name}).`, status: 400 }
      if (qty !== 1) return { error: `A serial number is one unit: use quantity 1 for ${serial}.`, status: 400 }
      const key = `${sl.product_id}|${serial}`
      if (taken.has(key) || seenSerial.has(key)) return { error: `Serial ${serial} is already on another credit note for this order.`, status: 409 }
      seenSerial.add(key)
    } else if (serial) return { error: `${name} isn’t serial tracked.`, status: 400 }
    if (isStock && p.batch_tracking) {
      if (!batch) return { error: `Choose the batch being returned for ${name}.`, status: 400 }
      if (!t?.batches.has(batch)) return { error: `Batch ${batch} wasn’t shipped on this order (${name}).`, status: 400 }
    } else if (batch) return { error: `${name} isn’t batch tracked.`, status: 400 }

    const lineId = String(sl.id)
    mine.set(lineId, (mine.get(lineId) ?? 0) + qty)
    const shipped = num(sl.quantity_shipped) || num(sl.quantity)
    const left = shipped - (returned.get(lineId) ?? 0)
    if ((mine.get(lineId) ?? 0) > left + 1e-9) return { error: `${name}: only ${Math.max(0, left)} left to return (shipped ${shipped}, already on other credit notes ${returned.get(lineId) ?? 0}).`, status: 409 }

    const eff = Math.round((1 - (1 - num(sl.discount) / 100) * factor) * 100 * 10000) / 10000
    rows.push({
      so_line_id: lineId, product_id: sl.product_id, product_name: sl.product_name, product_sku: sl.product_sku, unit: sl.unit,
      quantity: qty, unit_price: num(sl.unit_price), discount: eff > 0 ? eff : 0, tax_rate: num(sl.tax_rate), tax_rate_id: sl.tax_rate_id ?? null, tax_name: sl.tax_name ?? null,
      is_kit_parent: sl.is_kit_parent === true, bin_id: bin, serial_number: serial, batch_number: batch,
      expiry_date: clean(inp.expiry_date) || null, sort_order: i,
    })
  }
  return { rows, total: r2(rows.reduce((s, r) => s + creditLineTotal(r as { quantity: unknown; unit_price: unknown; discount: unknown; tax_rate: unknown }), 0)) }
}

/** Everything a printed credit note is built from: the same page as an invoice, titled Credit Note. */
export async function loadCreditNotePayload(db: Db, orgId: string, ids: string[]): Promise<InvoicePayload> {
  const { data: cns } = await db.from('credit_notes').select('*, credit_note_lines(*)').eq('org_id', orgId).in('id', ids)
  const list = ids.map(i => ((cns ?? []) as Row[]).find(c => c.id === i)).filter((c): c is Row => !!c && c.status !== 'Cancelled')
  const customerIds = [...new Set(list.map(c => c.customer_id).filter((x): x is string => typeof x === 'string'))]
  const [{ data: org }, { data: contacts }] = await Promise.all([
    db.from('organisations').select('name, trading_name, abn_nzbn, gst_number, logo_url, phone, email, contact_phone, contact_email, address, address_line1, address_line2, city, state, postcode, country, currency, base_currency, decimal_places, timezone, credit_note_settings, decimal_qty, decimal_qty_places').eq('id', orgId).single(),
    customerIds.length ? db.from('contacts').select('id, name, email, address, city, country, bill_name, bill_email, bill_street, bill_city, bill_postcode, bill_country, ship_name, ship_street, ship_city, ship_postcode, ship_country').eq('org_id', orgId).in('id', customerIds) : Promise.resolve({ data: [] }),
  ])
  const orgRow = (org ?? {}) as OrgDb
  const settings = normalizeCreditNoteSettings((orgRow as { credit_note_settings?: unknown }).credit_note_settings)
  const contactById = new Map(((contacts ?? []) as ContactDb[]).map(c => [c.id, c]))
  const dp = Number.isFinite(Number(orgRow.decimal_places)) && Number(orgRow.decimal_places) >= 0 ? Math.min(Number(orgRow.decimal_places), 4) : 2

  const orders: InvoiceOrder[] = []
  for (const c of list) {
    const raw = ((c.credit_note_lines ?? []) as Row[]).sort((a, b) => num(a.sort_order) - num(b.sort_order))
    // one printed row per product line (serials and batches listed under it)
    const lines: InvoiceLine[] = raw.map(l => {
      const amount = r2(num(l.quantity) * num(l.unit_price) * (1 - num(l.discount) / 100))
      return {
        name: clean(l.product_name), sku: clean(l.product_sku), qty: num(l.quantity), unitPrice: num(l.unit_price), discount: num(l.discount), taxRate: num(l.tax_rate), amount,
        serials: l.serial_number ? [String(l.serial_number)] : [], batches: l.batch_number ? [String(l.batch_number)] : [], expiries: l.expiry_date ? [String(l.expiry_date).slice(0, 10)] : [],
      }
    })
    const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0))
    const byRate = new Map<number, number>()
    for (const l of lines) if (l.taxRate > 0) byRate.set(l.taxRate, (byRate.get(l.taxRate) ?? 0) + l.amount * (l.taxRate / 100))
    const taxes: InvoiceTax[] = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, amount]) => ({ label: `Tax ${rate}%`, rate, amount: r2(amount) }))
    const taxTotal = r2(taxes.reduce((s, t) => s + t.amount, 0))
    const cust = typeof c.customer_id === 'string' ? contactById.get(c.customer_id) : undefined
    orders.push({
      id: String(c.id), kind: 'credit', so_number: clean(c.so_number), invoice_number: clean(c.cn_number), original_invoice: clean(c.invoice_number) || null, reason: clean(c.reason) || null,
      invoice_date: c.return_date ? String(c.return_date).slice(0, 10) : null, terms: null, customer_po: null, notes: clean(c.notes) || null,
      currency: clean(c.currency) || clean(orgRow.base_currency) || clean(orgRow.currency) || 'NZD',
      bill_to: billTo(cust, clean(c.customer_name)), ship_to: null, lines, costs: [],
      items_subtotal: subtotal, costs_subtotal: 0, discount_amount: 0, subtotal, taxes, tax_total: taxTotal, total: r2(subtotal + taxTotal),
    })
  }
  return { orders, business: business(orgRow), config: settings.template, timezone: clean(orgRow.timezone) || 'Pacific/Auckland', decimals: dp, qty: qtyFmtFromOrg(orgRow as { decimal_qty?: unknown; decimal_qty_places?: unknown }) }
}

/** The invoice number a closed order was invoiced under (INV-0005 for SO-0005). */
export async function invoiceNumberFor(db: Db, orgId: string, soId: string): Promise<string | null> {
  try {
    const p = await loadInvoicePayload(db, orgId, [soId], { kitDocs: false })
    return p.orders[0]?.invoice_number ?? null
  } catch { return null }
}
