// src/lib/purchase-order/data.ts
// Server side: loads one or several purchase orders and builds the same payload the invoice layout prints — who the order is
// to, where it is delivered, the lines at their ordered quantity, additional costs, order discount and tax (same maths as
// the purchase order screen). The business details come from Settings.

import { billTo, business, clean, num, r2, type ContactDb, type OrgDb } from '@/lib/invoice/data'
import type { InvoiceAddress, InvoiceCost, InvoiceLine, InvoiceOrder, InvoicePayload, InvoiceTax } from '@/lib/invoice/types'
import { normalizePurchaseOrderConfig, toInvoiceConfig } from './config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type LineDb = {
  product_name: string | null; product_sku: string | null; quantity_ordered: number | null
  unit_cost: number | null; discount: number | null; tax_rate: number | null; sort_order: number | null
}
type OrderDb = {
  id: string; po_number: string | null; status: string; supplier_id: string | null; supplier_name: string | null
  location_id: string | null; location_name: string | null; order_date: string | null; expected_date: string | null
  terms: string | null; ref: string | null; reference: string | null; notes: string | null; currency: string | null
  order_discount: number | null; order_discount_type: string | null
  purchase_order_lines: LineDb[] | null
}
type CostDb = { po_id: string; product_name: string | null; description: string | null; amount: number | null; tax_rate: number | null; sort_order: number | null }
type LocationDb = { id: string; name: string | null; address: string | null; city: string | null; country: string | null; phone: string | null; email: string | null }

export async function loadPurchaseOrderPayload(db: Db, orgId: string, ids: string[]): Promise<InvoicePayload> {
  const { data: orderRows } = await db
    .from('purchase_orders')
    .select(`
      id, po_number, status, supplier_id, supplier_name, location_id, location_name, order_date, expected_date,
      terms, ref, reference, notes, currency, order_discount, order_discount_type,
      purchase_order_lines ( product_name, product_sku, quantity_ordered, unit_cost, discount, tax_rate, sort_order )
    `)
    .eq('org_id', orgId)
    .in('id', ids)
  const all = (orderRows ?? []) as OrderDb[]
  // a cancelled order has nothing to send
  const orders = ids.map(i => all.find(o => o.id === i)).filter((o): o is OrderDb => !!o && String(o.status).toLowerCase() !== 'cancelled')

  const orderIds = orders.map(o => o.id)
  const supplierIds = [...new Set(orders.map(o => o.supplier_id).filter((x): x is string => !!x))]
  const locationIds = [...new Set(orders.map(o => o.location_id).filter((x): x is string => !!x))]
  const none = Promise.resolve({ data: [] })
  const [{ data: org }, { data: costs }, { data: contacts }, { data: locations }] = await Promise.all([
    db.from('organisations').select('name, trading_name, abn_nzbn, gst_number, logo_url, phone, email, contact_phone, contact_email, address, address_line1, address_line2, city, state, postcode, country, currency, base_currency, decimal_places, timezone, purchase_order_settings').eq('id', orgId).single(),
    orderIds.length ? db.from('purchase_order_cost_lines').select('po_id, product_name, description, amount, tax_rate, sort_order').in('po_id', orderIds).order('sort_order') : none,
    supplierIds.length ? db.from('contacts').select('id, name, email, address, city, country, bill_name, bill_email, bill_street, bill_city, bill_postcode, bill_country, ship_name, ship_street, ship_city, ship_postcode, ship_country').eq('org_id', orgId).in('id', supplierIds) : none,
    locationIds.length ? db.from('locations').select('id, name, address, city, country, phone, email').eq('org_id', orgId).in('id', locationIds) : none,
  ])
  const orgRow = (org ?? {}) as OrgDb & { purchase_order_settings?: unknown }
  const config = toInvoiceConfig(normalizePurchaseOrderConfig(orgRow.purchase_order_settings))
  const contactById = new Map(((contacts ?? []) as ContactDb[]).map(c => [c.id, c]))
  const locationById = new Map(((locations ?? []) as LocationDb[]).map(l => [l.id, l]))
  const costsByOrder = new Map<string, CostDb[]>()
  for (const c of (costs ?? []) as CostDb[]) costsByOrder.set(c.po_id, [...(costsByOrder.get(c.po_id) ?? []), c])
  const dp = Number.isFinite(Number(orgRow.decimal_places)) && Number(orgRow.decimal_places) >= 0 ? Math.min(Number(orgRow.decimal_places), 4) : 2

  const deliverTo = (l: LocationDb | undefined, fallbackName: string): InvoiceAddress | null => {
    if (!l) return fallbackName ? { name: fallbackName, lines: [], email: null } : null
    return {
      name: clean(l.name) || fallbackName,
      lines: [clean(l.address), clean(l.city), clean(l.country), clean(l.phone)].filter(Boolean),
      email: clean(l.email) || null,
    }
  }

  const out: InvoiceOrder[] = orders.map(o => {
    const lines: InvoiceLine[] = []
    for (const l of [...(o.purchase_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
      const qty = num(l.quantity_ordered)
      if (qty <= 0) continue
      const unitPrice = num(l.unit_cost), discount = num(l.discount)
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

    // same maths as the purchase order screen: the order discount comes off everything, tax follows the discounted amounts
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

    const poNumber = o.po_number ?? ''
    return {
      id: o.id,
      kind: 'purchase' as const,
      so_number: poNumber,
      invoice_number: poNumber,
      invoice_date: o.order_date ? String(o.order_date).slice(0, 10) : null,
      due_date: o.expected_date ? String(o.expected_date).slice(0, 10) : null,
      terms: clean(o.terms) || null,
      customer_po: clean(o.ref) || clean(o.reference) || null,
      notes: clean(o.notes) || null,
      currency: clean(o.currency) || clean(orgRow.base_currency) || clean(orgRow.currency) || 'NZD',
      bill_to: billTo(o.supplier_id ? contactById.get(o.supplier_id) : undefined, clean(o.supplier_name)),
      ship_to: deliverTo(o.location_id ? locationById.get(o.location_id) : undefined, clean(o.location_name)),
      lines, costs: costLines,
      items_subtotal: itemsSubtotal, costs_subtotal: costsSubtotal, discount_amount: discountAmount,
      subtotal, taxes, tax_total: taxTotal, total: r2(subtotal + taxTotal),
    }
  })

  return { orders: out, business: business(orgRow), config, timezone: clean(orgRow.timezone) || 'Pacific/Auckland', decimals: dp }
}
