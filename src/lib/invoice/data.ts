// src/lib/invoice/data.ts
// Server side: loads one or several sales orders and works out everything an invoice needs — who is billed, what is
// billed (the units that shipped; the ordered units while nothing has been picked yet), the additional costs, the order
// discount and the tax, using the same maths as the sales order screen. The business details come from Settings.

import { normalizeInvoiceConfig } from './config'
import type { InvoiceAddress, InvoiceBusiness, InvoiceCost, InvoiceLine, InvoiceOrder, InvoicePayload, InvoiceTax } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Orders an invoice can be printed for: anything past Draft that isn't Cancelled (quotes print as "Quote"). */
const OPEN_GROUP = ['open', 'no stock', 'stock available', 'partial stock']
export const INVOICE_STATUSES = [...OPEN_GROUP, 'picking', 'partially picked', 'partially packed', 'picked', 'packed', 'closed', 'shipped', 'delivered', 'quote']

type LineDb = {
  id: string; product_name: string | null; product_sku: string | null
  quantity: number | null; quantity_picked: number | null; quantity_packed: number | null; quantity_shipped: number | null
  unit_price: number | null; discount: number | null; tax_rate: number | null; sort_order: number | null
}
type OrderDb = {
  id: string; so_number: string | null; status: string; customer_id: string | null; customer_name: string | null
  order_date: string | null; shipped_date: string | null; closed_at: string | null
  terms: string | null; ref: string | null; notes: string | null; currency: string | null
  order_discount: number | null; order_discount_type: string | null
  sales_order_lines: LineDb[] | null
}
type CostDb = { so_id: string; product_name: string | null; description: string | null; amount: number | null; tax_rate: number | null; sort_order: number | null }
export type ContactDb = {
  id: string; name: string | null; email: string | null; address: string | null; city: string | null; country: string | null
  bill_name: string | null; bill_email: string | null; bill_street: string | null; bill_city: string | null; bill_postcode: string | null; bill_country: string | null
  ship_name: string | null; ship_street: string | null; ship_city: string | null; ship_postcode: string | null; ship_country: string | null
}

export const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const joinParts = (parts: unknown[]) => parts.map(clean).filter(Boolean).join(' ')

export function billTo(c: ContactDb | undefined, fallbackName: string): InvoiceAddress | null {
  if (!c) return fallbackName ? { name: fallbackName, lines: [], email: null } : null
  const has = !!(clean(c.bill_street) || clean(c.bill_city) || clean(c.bill_postcode))
  return {
    name: clean(c.bill_name) || clean(c.name) || fallbackName,
    lines: (has ? [clean(c.bill_street), joinParts([c.bill_city, c.bill_postcode]), clean(c.bill_country)] : [clean(c.address), clean(c.city), clean(c.country)]).filter(Boolean),
    email: clean(c.bill_email) || clean(c.email) || null,
  }
}

function shipTo(c: ContactDb | undefined, fallbackName: string): InvoiceAddress | null {
  if (!c) return fallbackName ? { name: fallbackName, lines: [], email: null } : null
  const has = !!(clean(c.ship_street) || clean(c.ship_city) || clean(c.ship_postcode))
  return {
    name: clean(c.ship_name) || clean(c.name) || fallbackName,
    lines: (has ? [clean(c.ship_street), joinParts([c.ship_city, c.ship_postcode]), clean(c.ship_country)] : [clean(c.address), clean(c.city), clean(c.country)]).filter(Boolean),
    email: null,
  }
}

function businessNumberLabel(country: string): string {
  if (/australia|^au$/i.test(country)) return 'ABN'
  if (/new zealand|^nz$/i.test(country) || !country) return 'NZBN'
  return 'Business no.'
}

export type OrgDb = Record<string, string | number | null | undefined> & { invoice_settings?: unknown }
export function business(org: OrgDb): InvoiceBusiness {
  const cityLine = joinParts([org.city, org.state, org.postcode])
  const structured = [clean(org.address_line1), clean(org.address_line2), cityLine, clean(org.country)].filter(Boolean)
  const address = structured.length ? structured : clean(org.address).split(/\r?\n/).map(clean).filter(Boolean)
  return {
    name: clean(org.trading_name) || clean(org.name),
    logo_url: clean(org.logo_url) || null,
    address,
    phone: clean(org.phone) || clean(org.contact_phone) || null,
    email: clean(org.email) || clean(org.contact_email) || null,
    numbers: [
      clean(org.gst_number) ? `Tax no. ${clean(org.gst_number)}` : '',
      clean(org.abn_nzbn) ? `${businessNumberLabel(clean(org.country))} ${clean(org.abn_nzbn)}` : '',
    ].filter(Boolean),
  }
}

/** SO-0005 → INV-0005 (the digits of the order number, behind the invoice prefix from Settings). */
function invoiceNumber(soNumber: string, org: OrgDb, prefix: string): string {
  const soPrefix = clean(org.so_prefix) || 'SO-'
  const soSuffix = clean(org.so_suffix)
  let n = soNumber
  if (soPrefix && n.startsWith(soPrefix)) n = n.slice(soPrefix.length)
  if (soSuffix && n.endsWith(soSuffix)) n = n.slice(0, -soSuffix.length)
  return `${prefix}${/^\d+$/.test(n) ? n : soNumber}`
}

export async function loadInvoicePayload(db: Db, orgId: string, ids: string[]): Promise<InvoicePayload> {
  const { data: orderRows } = await db
    .from('sales_orders')
    .select(`
      id, so_number, status, customer_id, customer_name, order_date, shipped_date, closed_at,
      terms, ref, notes, currency, order_discount, order_discount_type,
      sales_order_lines ( id, product_name, product_sku, quantity, quantity_picked, quantity_packed, quantity_shipped, unit_price, discount, tax_rate, sort_order )
    `)
    .eq('org_id', orgId)
    .in('id', ids)
  const all = (orderRows ?? []) as OrderDb[]
  const orders = ids
    .map(i => all.find(o => o.id === i))
    .filter((o): o is OrderDb => !!o && INVOICE_STATUSES.includes(String(o.status).toLowerCase()))

  const orderIds = orders.map(o => o.id)
  const customerIds = [...new Set(orders.map(o => o.customer_id).filter((x): x is string => !!x))]
  const none = Promise.resolve({ data: [] })
  const [{ data: org }, { data: costs }, { data: contacts }] = await Promise.all([
    db.from('organisations').select('name, trading_name, abn_nzbn, gst_number, logo_url, phone, email, contact_phone, contact_email, address, address_line1, address_line2, city, state, postcode, country, currency, base_currency, decimal_places, timezone, so_prefix, so_suffix, invoice_settings').eq('id', orgId).single(),
    orderIds.length ? db.from('sales_order_cost_lines').select('so_id, product_name, description, amount, tax_rate, sort_order').in('so_id', orderIds).order('sort_order') : none,
    customerIds.length ? db.from('contacts').select('id, name, email, address, city, country, bill_name, bill_email, bill_street, bill_city, bill_postcode, bill_country, ship_name, ship_street, ship_city, ship_postcode, ship_country').eq('org_id', orgId).in('id', customerIds) : none,
  ])
  const orgRow = (org ?? {}) as OrgDb
  const config = normalizeInvoiceConfig(orgRow.invoice_settings)
  const contactById = new Map(((contacts ?? []) as ContactDb[]).map(c => [c.id, c]))
  const costsByOrder = new Map<string, CostDb[]>()
  for (const c of (costs ?? []) as CostDb[]) costsByOrder.set(c.so_id, [...(costsByOrder.get(c.so_id) ?? []), c])
  const dp = Number.isFinite(Number(orgRow.decimal_places)) && Number(orgRow.decimal_places) >= 0 ? Math.min(Number(orgRow.decimal_places), 4) : 2

  const out: InvoiceOrder[] = orders.map(o => {
    const isQuote = String(o.status).toLowerCase() === 'quote'
    const nothingPickedYet = isQuote || OPEN_GROUP.includes(String(o.status).toLowerCase())
    const lines: InvoiceLine[] = []
    for (const l of [...(o.sales_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
      const picked = num(l.quantity_picked), packed = num(l.quantity_packed), sent = num(l.quantity_shipped)
      const qty = nothingPickedYet ? num(l.quantity) : sent > 0 ? sent : packed > 0 ? packed : picked
      if (qty <= 0) continue
      const unitPrice = num(l.unit_price), discount = num(l.discount)
      lines.push({
        name: clean(l.product_name), sku: clean(l.product_sku), qty, unitPrice, discount,
        taxRate: num(l.tax_rate), amount: r2(qty * unitPrice * (1 - discount / 100)),
      })
    }
    const costLines: InvoiceCost[] = (costsByOrder.get(o.id) ?? [])
      .filter(c => num(c.amount) !== 0)
      .map(c => ({
        name: clean(c.product_name) || clean(c.description) || 'Additional cost',
        sub: clean(c.product_name) ? clean(c.description) : '',
        taxRate: num(c.tax_rate), amount: r2(num(c.amount)),
      }))

    // same maths as the sales order screen: the order discount comes off everything, tax follows the discounted amounts
    const itemsSubtotal = r2(lines.reduce((s, l) => s + l.amount, 0))
    const costsSubtotal = r2(costLines.reduce((s, c) => s + c.amount, 0))
    const pre = itemsSubtotal + costsSubtotal
    const discValue = num(o.order_discount)
    const discountAmount = r2(pre <= 0 ? 0 : o.order_discount_type === '%' ? pre * (discValue / 100) : Math.min(discValue, pre))
    const subtotal = r2(pre - discountAmount)
    const factor = pre > 0 ? subtotal / pre : 1
    const byRate = new Map<number, number>()
    for (const x of [...lines.map(l => ({ rate: l.taxRate, amt: l.amount })), ...costLines.map(c => ({ rate: c.taxRate, amt: c.amount }))]) {
      if (x.rate > 0) byRate.set(x.rate, (byRate.get(x.rate) ?? 0) + x.amt * factor * (x.rate / 100))
    }
    const taxes: InvoiceTax[] = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, amt]) => ({ label: `Tax ${rate}%`, rate, amount: r2(amt) }))
    const taxTotal = r2(taxes.reduce((s, t) => s + t.amount, 0))

    const soNumber = o.so_number ?? ''
    return {
      id: o.id,
      so_number: soNumber,
      is_quote: isQuote,
      // a quote keeps the order number it will have as a sales order
      invoice_number: isQuote ? soNumber : invoiceNumber(soNumber, orgRow, config.content.numberPrefix),
      invoice_date: isQuote ? (o.order_date ? String(o.order_date).slice(0, 10) : null) : (o.shipped_date ?? (o.closed_at ? String(o.closed_at).slice(0, 10) : null)),
      terms: clean(o.terms) || null,
      customer_po: clean(o.ref) || null,
      notes: clean(o.notes) || null,
      currency: clean(o.currency) || clean(orgRow.base_currency) || clean(orgRow.currency) || 'NZD',
      bill_to: billTo(o.customer_id ? contactById.get(o.customer_id) : undefined, clean(o.customer_name)),
      ship_to: shipTo(o.customer_id ? contactById.get(o.customer_id) : undefined, clean(o.customer_name)),
      lines, costs: costLines,
      items_subtotal: itemsSubtotal, costs_subtotal: costsSubtotal, discount_amount: discountAmount,
      subtotal, taxes, tax_total: taxTotal, total: r2(subtotal + taxTotal),
    }
  })

  return { orders: out, business: business(orgRow), config, timezone: clean(orgRow.timezone) || 'Pacific/Auckland', decimals: dp }
}
