// src/lib/sales-pack-data.ts
// Loads what the Pack screen needs for one or several sales orders.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function loadPackData(db: Db, orgId: string, ids: string[], allowedStatuses: string[]) {
  const { data: orderRows } = await db
    .from('sales_orders')
    .select(`
      id, so_number, status, customer_name, location_name,
      carrier, shipping_method, service_type, tracking_number,
      sales_order_lines ( id, product_name, product_sku, unit, quantity_picked, sort_order )
    `)
    .eq('org_id', orgId)
    .in('id', ids)

  type L = { id: string; product_name: string | null; product_sku: string | null; unit: string | null; quantity_picked: number | null; sort_order: number | null }
  type O = {
    id: string; so_number: string | null; status: string; customer_name: string | null
    carrier: string | null; shipping_method: string | null; service_type: string | null; tracking_number: string | null
    sales_order_lines: L[] | null
  }
  const all = (orderRows ?? []) as O[]
  const orders = ids
    .map(i => all.find(o => o.id === i))
    .filter((o): o is O => !!o && allowedStatuses.includes(String(o.status).toLowerCase()))

  if (orders.length === 0) return []

  const [{ data: org }, { data: cartons }] = await Promise.all([
    db.from('organisations').select('default_carrier, default_shipping_method').eq('id', orgId).single(),
    db.from('sales_order_cartons')
      .select('id, so_id, name, sort_order, sales_order_carton_lines ( so_line_id, qty )')
      .in('so_id', orders.map(o => o.id))
      .order('sort_order'),
  ])
  const orgData = (org ?? {}) as { default_carrier?: string | null; default_shipping_method?: string | null }
  type C = { id: string; so_id: string; name: string; sales_order_carton_lines: { so_line_id: string; qty: number }[] | null }

  return orders.map(o => ({
    order: { id: o.id, so_number: o.so_number ?? '', customer_name: o.customer_name ?? '' },
    lines: [...(o.sales_order_lines ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .filter(l => Number(l.quantity_picked ?? 0) > 0)
      .map(l => ({ id: l.id, name: l.product_name ?? '', sku: l.product_sku ?? '', unit: l.unit ?? 'Each', picked: Number(l.quantity_picked) })),
    savedCartons: ((cartons ?? []) as C[])
      .filter(c => c.so_id === o.id)
      .map(c => ({
        name: c.name,
        lines: (c.sales_order_carton_lines ?? []).map(x => ({ line_id: x.so_line_id, qty: Number(x.qty) })),
      })),
    carrier: o.carrier ?? orgData.default_carrier ?? 'NZ Post',
    method: o.shipping_method ?? orgData.default_shipping_method ?? 'Standard Courier',
    service: o.service_type ?? '',
    tracking: o.tracking_number ?? '',
  }))
}

// Packing one order from its own page can also re-open a Packed order; bulk packing only takes Picked orders.
export const PACK_SINGLE = ['picking', 'partially picked', 'picked', 'packed']
export const PACK_BULK = ['picked']
