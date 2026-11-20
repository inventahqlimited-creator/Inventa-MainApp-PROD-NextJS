// src/lib/sales-tracking.ts
// Which serial numbers / batches went (or are picked to go) out on each line of a sales order.
//   • Before the order is closed: the picks (sales_order_picks), which are per line.
//   • After it is closed: the sale stock movements, which are per product, so they are shared out across that product's lines in order.
import type { SupabaseClient } from '@supabase/supabase-js'

export type TrackedEntry = { serial: string | null; batch: string | null; expiry: string | null; qty: number }
type Row = { serial_number: string | null; batch_number: string | null; expiry_date: string | null; qty: number | string }
const toEntry = (r: Row): TrackedEntry => ({ serial: r.serial_number || null, batch: r.batch_number || null, expiry: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null, qty: Math.abs(Number(r.qty) || 0) })
const isTracked = (r: Row) => !!(r.serial_number || r.batch_number)

export async function loadTrackedByLine(
  db: SupabaseClient, orgId: string, soId: string, status: string,
  lines: { id: string; product_id: string; quantity: number | string; sort_order?: number | null }[],
): Promise<Map<string, TrackedEntry[]>> {
  const out = new Map<string, TrackedEntry[]>()
  if (!lines.length || ['draft', 'quote', 'cancelled'].includes(status.toLowerCase())) return out

  if (status.toLowerCase() !== 'closed') {
    const { data } = await db.from('sales_order_picks').select('so_line_id, serial_number, batch_number, expiry_date, qty').eq('org_id', orgId).eq('so_id', soId)
    for (const r of (data ?? []) as (Row & { so_line_id: string })[]) {
      if (!isTracked(r)) continue
      out.set(r.so_line_id, [...(out.get(r.so_line_id) ?? []), toEntry(r)])
    }
    return out
  }

  const [{ data: moves }, { data: prods }] = await Promise.all([
    db.from('stock_movements').select('product_id, serial_number, batch_number, expiry_date, qty, created_at')
      .eq('org_id', orgId).eq('reference_id', soId).eq('reference_type', 'sales_order').eq('movement_type', 'sale').order('created_at'),
    db.from('products').select('id, sell_uom_qty').in('id', [...new Set(lines.map(l => l.product_id))]),
  ])
  const factor = new Map(((prods ?? []) as { id: string; sell_uom_qty: number | null }[]).map(p => [p.id, Number(p.sell_uom_qty) > 0 ? Number(p.sell_uom_qty) : 1]))
  const queue = new Map<string, TrackedEntry[]>()
  for (const r of (moves ?? []) as (Row & { product_id: string })[]) {
    if (!isTracked(r)) continue
    queue.set(r.product_id, [...(queue.get(r.product_id) ?? []), toEntry(r)])
  }
  const ordered = [...lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  for (const l of ordered) {
    const q = queue.get(l.product_id)
    if (!q?.length) continue
    let need = Number(l.quantity) * (factor.get(l.product_id) ?? 1)
    const mine: TrackedEntry[] = []
    while (q.length && need > 1e-9) { const e = q.shift()!; mine.push(e); need -= e.qty }
    if (mine.length) out.set(l.id, mine)
  }
  return out
}
