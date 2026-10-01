// src/lib/packing-list/data.ts
// Server side: loads one or several sales orders and builds everything a packing list needs — the business, the
// ship-from and ship-to details, the shipping details, and what was shipped (with batch, serial and expiry from the
// picks). Quantities come from the cartons: the ones on the Pack screen right now (overrides), else the saved ones,
// else whatever was packed / picked.

import { normalizePackingListConfig } from './config'
import type { PackAddress, PackBusiness, PackOrder, PackOverrides, PackRow, PackingListPayload } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Orders a packing list can be printed for: anything that has something picked, up to and including closed. */
export const PACK_PRINT_STATUSES = ['picking', 'partially picked', 'picked', 'packed', 'partially packed', 'closed', 'shipped', 'delivered']

type LineRow = {
  id: string; product_name: string | null; product_sku: string | null; unit: string | null
  quantity: number | null; quantity_picked: number | null; quantity_packed: number | null; quantity_shipped: number | null
  line_notes: string | null; sort_order: number | null
}
type OrderRow = {
  id: string; so_number: string | null; status: string; customer_id: string | null; customer_name: string | null
  location_id: string | null; location_name: string | null
  order_date: string | null; expected_date: string | null; shipped_date: string | null; closed_at: string | null
  notes: string | null; ref: string | null; reference: string | null
  carrier: string | null; shipping_method: string | null; service_type: string | null; tracking_number: string | null
  sales_order_lines: LineRow[] | null
}
type PickRowDb = { so_id: string; so_line_id: string; qty: number | null; batch_number: string | null; serial_number: string | null; expiry_date: string | null; created_at: string }
type CartonDb = { id: string; so_id: string; sales_order_carton_lines: { so_line_id: string; qty: number }[] | null }
type ContactDb = {
  id: string; name: string | null; address: string | null; city: string | null; country: string | null; phone: string | null
  ship_name: string | null; ship_street: string | null; ship_city: string | null; ship_postcode: string | null; ship_country: string | null; ship_phone: string | null
}
type LocationDb = { id: string; name: string | null; address: string | null; city: string | null; country: string | null; phone: string | null }

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const joinParts = (parts: unknown[], sep = ' ') => parts.map(clean).filter(Boolean).join(sep)
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function shipTo(c: ContactDb | undefined, fallbackName: string): PackAddress | null {
  if (!c) return fallbackName ? { name: fallbackName, lines: [], phone: null } : null
  // the delivery address if one is saved, otherwise the contact's main address
  const hasShip = !!(clean(c.ship_street) || clean(c.ship_city) || clean(c.ship_postcode))
  const street = hasShip ? clean(c.ship_street) : clean(c.address)
  const cityLine = hasShip ? joinParts([c.ship_city, c.ship_postcode]) : clean(c.city)
  const country = hasShip ? clean(c.ship_country) : clean(c.country)
  return {
    name: clean(c.ship_name) || clean(c.name) || fallbackName,
    lines: [street, cityLine, country].filter(Boolean),
    phone: clean(c.ship_phone) || clean(c.phone) || null,
  }
}

function shipFrom(l: LocationDb | undefined, fallbackName: string): PackAddress | null {
  if (!l) return fallbackName ? { name: fallbackName, lines: [], phone: null } : null
  return {
    name: clean(l.name) || fallbackName,
    lines: [clean(l.address), clean(l.city), clean(l.country)].filter(Boolean),
    phone: clean(l.phone) || null,
  }
}

type OrgDb = Record<string, string | null | undefined> & { packing_list_settings?: unknown }
function business(org: OrgDb): PackBusiness {
  const cityLine = joinParts([org.city, org.state, org.postcode])
  const structured = [clean(org.address_line1), clean(org.address_line2), cityLine, clean(org.country)].filter(Boolean)
  const address = structured.length ? structured : clean(org.address).split(/\r?\n/).map(clean).filter(Boolean)
  const tax = [clean(org.abn_nzbn) ? `NZBN/ABN ${clean(org.abn_nzbn)}` : '', clean(org.gst_number) ? `GST ${clean(org.gst_number)}` : ''].filter(Boolean).join(' · ')
  return {
    name: clean(org.trading_name) || clean(org.name),
    logo_url: clean(org.logo_url) || null,
    address,
    phone: clean(org.phone) || clean(org.contact_phone) || null,
    email: clean(org.email) || clean(org.contact_email) || null,
    tax_number: tax || null,
  }
}

export async function loadPackingListPayload(db: Db, orgId: string, ids: string[], overrides?: PackOverrides): Promise<PackingListPayload> {
  const { data: orderRows } = await db
    .from('sales_orders')
    .select(`
      id, so_number, status, customer_id, customer_name, location_id, location_name,
      order_date, expected_date, shipped_date, closed_at, notes, ref, reference,
      carrier, shipping_method, service_type, tracking_number,
      sales_order_lines ( id, product_name, product_sku, unit, quantity, quantity_picked, quantity_packed, quantity_shipped, line_notes, sort_order )
    `)
    .eq('org_id', orgId)
    .in('id', ids)
  const all = (orderRows ?? []) as OrderRow[]
  const orders = ids
    .map(i => all.find(o => o.id === i))
    .filter((o): o is OrderRow => !!o && PACK_PRINT_STATUSES.includes(String(o.status).toLowerCase()))

  const orderIds = orders.map(o => o.id)
  const customerIds = [...new Set(orders.map(o => o.customer_id).filter((x): x is string => !!x))]
  const locationIds = [...new Set(orders.map(o => o.location_id).filter((x): x is string => !!x))]
  const none = Promise.resolve({ data: [] })

  const [{ data: org }, { data: picks }, { data: cartons }, { data: contacts }, { data: locations }] = await Promise.all([
    db.from('organisations').select('name, trading_name, abn_nzbn, gst_number, logo_url, phone, email, contact_phone, contact_email, address, address_line1, address_line2, city, state, postcode, country, default_carrier, default_shipping_method, timezone, packing_list_settings').eq('id', orgId).single(),
    orderIds.length ? db.from('sales_order_picks').select('so_id, so_line_id, qty, batch_number, serial_number, expiry_date, created_at').in('so_id', orderIds).order('created_at') : none,
    orderIds.length ? db.from('sales_order_cartons').select('id, so_id, sales_order_carton_lines ( so_line_id, qty )').in('so_id', orderIds) : none,
    customerIds.length ? db.from('contacts').select('id, name, address, city, country, phone, ship_name, ship_street, ship_city, ship_postcode, ship_country, ship_phone').in('id', customerIds) : none,
    locationIds.length ? db.from('locations').select('id, name, address, city, country, phone').in('id', locationIds) : none,
  ])
  const orgRow = (org ?? {}) as OrgDb
  const contactById = new Map(((contacts ?? []) as ContactDb[]).map(c => [c.id, c]))
  const locationById = new Map(((locations ?? []) as LocationDb[]).map(l => [l.id, l]))
  const picksByLine = new Map<string, PickRowDb[]>()
  for (const p of (picks ?? []) as PickRowDb[]) picksByLine.set(p.so_line_id, [...(picksByLine.get(p.so_line_id) ?? []), p])
  const cartonsByOrder = new Map<string, CartonDb[]>()
  for (const c of (cartons ?? []) as CartonDb[]) cartonsByOrder.set(c.so_id, [...(cartonsByOrder.get(c.so_id) ?? []), c])

  const out: PackOrder[] = orders.map(o => {
    const ov = overrides?.[o.id]
    // cartons: the screen's, else the saved ones
    const cartonLines: { line_id: string; qty: number }[][] | null = ov
      ? ov.cartons.map(c => c.lines)
      : (cartonsByOrder.get(o.id) ?? []).length
        ? (cartonsByOrder.get(o.id) ?? []).map(c => (c.sales_order_carton_lines ?? []).map(x => ({ line_id: x.so_line_id, qty: num(x.qty) })))
        : null
    const cartonQty = new Map<string, number>()
    for (const c of cartonLines ?? []) for (const l of c) cartonQty.set(l.line_id, (cartonQty.get(l.line_id) ?? 0) + l.qty)
    const packages = cartonLines ? cartonLines.filter(c => c.some(l => l.qty > 0)).length || null : null

    const rows: PackRow[] = []
    const lines = [...(o.sales_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    for (const l of lines) {
      const ordered = num(l.quantity)
      const picked = num(l.quantity_picked), packed = num(l.quantity_packed), sent = num(l.quantity_shipped)
      if (ordered <= 0 && picked <= 0) continue
      const shipped = cartonLines ? (cartonQty.get(l.id) ?? 0) : sent > 0 ? sent : packed > 0 ? packed : picked
      const base = { line_id: l.id, name: clean(l.product_name), sku: clean(l.product_sku), note: clean(l.line_notes) || null, unit: clean(l.unit) || 'Each' }

      // share what was shipped across the batches / serials it was picked from
      const groups: { batch: string | null; expiry: string | null; qty: number; serials: string[] }[] = []
      let left = shipped
      for (const p of picksByLine.get(l.id) ?? []) {
        const take = Math.min(num(p.qty), left)
        if (take <= 0) continue
        left -= take
        const batch = clean(p.batch_number) || null
        const expiry = p.expiry_date ? String(p.expiry_date).slice(0, 10) : null
        let g = groups.find(x => x.batch === batch && x.expiry === expiry)
        if (!g) { g = { batch, expiry, qty: 0, serials: [] }; groups.push(g) }
        g.qty += take
        if (clean(p.serial_number)) g.serials.push(clean(p.serial_number))
      }
      if (left > 0 || groups.length === 0) {
        let g = groups.find(x => !x.batch && !x.expiry)
        if (!g) { g = { batch: null, expiry: null, qty: 0, serials: [] }; groups.push(g) }
        g.qty += Math.max(left, 0)
      }
      const backorder = Math.max(ordered - shipped, 0)
      groups.forEach((g, i) => rows.push({
        ...base,
        ordered: i === 0 ? ordered : null,
        shipped: g.qty,
        backorder: i === 0 ? backorder : null,
        batch: g.batch, expiry: g.expiry, serials: g.serials,
        continued: i > 0 || undefined,
      }))
    }

    const method = clean(ov?.method ?? o.shipping_method ?? orgRow.default_shipping_method)
    const service = clean(ov?.service ?? o.service_type)
    return {
      id: o.id,
      so_number: o.so_number ?? '',
      order_date: o.order_date,
      ship_date: o.shipped_date ?? (o.closed_at ? String(o.closed_at).slice(0, 10) : null),
      ship_by: o.expected_date,
      customer_ref: clean(o.ref) || clean(o.reference) || null,
      ship_from: shipFrom(o.location_id ? locationById.get(o.location_id) : undefined, clean(o.location_name)),
      ship_to: shipTo(o.customer_id ? contactById.get(o.customer_id) : undefined, clean(o.customer_name)),
      carrier: clean(ov?.carrier ?? o.carrier ?? orgRow.default_carrier),
      service: [method, service].filter(Boolean).join(' · '),
      tracking: clean(ov?.tracking ?? o.tracking_number),
      packages,
      notes: clean(o.notes) || null,
      rows,
    }
  })

  return {
    orders: out,
    business: business(orgRow),
    config: normalizePackingListConfig(orgRow.packing_list_settings),
    timezone: clean(orgRow.timezone) || 'Pacific/Auckland',
  }
}
