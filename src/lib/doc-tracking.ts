// src/lib/doc-tracking.ts
// Which serial numbers / batches / expiry dates went out on each sales order line — for the invoice and the packing list.
// While an order is being fulfilled this is read from its picks. Once it is shipped the picks are gone, so it is read from
// the stock movements the shipment wrote (movements are per product, so they are attached to the first line for that product).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type TrackedQty = { qty: number | null; batch_number: string | null; serial_number: string | null; expiry_date: string | null }
export type TrackOrder = { id: string; status: string | null; lines: { id: string; product_id: string | null }[] }

const SHIPPED = ['closed', 'shipped', 'delivered']

export async function loadLineTracking(db: Db, orgId: string, orders: TrackOrder[]): Promise<Map<string, TrackedQty[]>> {
  const out = new Map<string, TrackedQty[]>()
  if (orders.length === 0) return out
  const ids = orders.map(o => o.id)

  const { data: picks } = await db.from('sales_order_picks')
    .select('so_line_id, qty, batch_number, serial_number, expiry_date, created_at')
    .eq('org_id', orgId).in('so_id', ids).order('created_at')
  for (const p of (picks ?? []) as (TrackedQty & { so_line_id: string })[]) {
    out.set(p.so_line_id, [...(out.get(p.so_line_id) ?? []), p])
  }

  const shipped = orders.filter(o => SHIPPED.includes(String(o.status ?? '').toLowerCase()))
  if (shipped.length) {
    const { data: mv } = await db.from('stock_movements')
      .select('reference_id, product_id, qty, batch_number, serial_number, expiry_date, created_at')
      .eq('org_id', orgId).eq('reference_type', 'sales_order').eq('movement_type', 'sale')
      .in('reference_id', shipped.map(o => o.id)).order('created_at')
    type M = { reference_id: string; product_id: string; qty: number | null; batch_number: string | null; serial_number: string | null; expiry_date: string | null }
    for (const o of shipped) {
      for (const l of o.lines) {
        if (!l.product_id || out.has(l.id)) continue
        if (o.lines.find(x => x.product_id === l.product_id)?.id !== l.id) continue
        const rows = ((mv ?? []) as M[])
          .filter(m => m.reference_id === o.id && m.product_id === l.product_id && (m.batch_number || m.serial_number || m.expiry_date))
          .map(m => ({ qty: Math.abs(Number(m.qty) || 0), batch_number: m.batch_number, serial_number: m.serial_number, expiry_date: m.expiry_date }))
        if (rows.length) out.set(l.id, rows)
      }
    }
  }
  return out
}

/** Unique values, in order, for printing in one cell */
export function uniq(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const v of values) { const t = (v ?? '').trim(); if (t) seen.add(t) }
  return [...seen]
}
