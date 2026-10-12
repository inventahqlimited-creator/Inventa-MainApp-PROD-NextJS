// src/app/api/org/purchases/auto-receive/route.ts
// Auto Receive: receives the full outstanding quantity of each selected Open / Partially Received order
// into its delivery location (no bin) and closes it. Orders with batch, expiry or serial tracked products
// are refused — those details have to be entered on the Receive screen.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { allocateLandedCost, normalizeMethod } from '@/lib/purchases/landed-cost'

export async function POST(req: Request) {
  const g = await requirePerm('receive_purchases')
  if ('res' in g) return g.res
  const { db, orgId, userId, name, email } = g.access
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : []
  if (ids.length === 0) return NextResponse.json({ error: 'No orders selected' }, { status: 400 })

  const { data: org } = await db.from('organisations').select('landing_cost_method').eq('id', orgId).single()
  const method = normalizeMethod((org as { landing_cost_method?: string } | null)?.landing_cost_method)
  const { data: orders } = await db.from('purchase_orders').select('id, po_number, status').eq('org_id', orgId).in('id', ids)

  const received: { id: string; po_number: string | null }[] = []
  const failed: { id: string; po_number: string | null; error: string }[] = []
  for (const o of (orders ?? []) as { id: string; po_number: string | null; status: string }[]) {
    if (!['open', 'partially received'].includes(o.status.toLowerCase())) continue
    const fail = (error: string) => failed.push({ id: o.id, po_number: o.po_number, error })

    const [{ data: lines }, { data: costRows }] = await Promise.all([
      db.from('purchase_order_lines').select('id, product_id, quantity_ordered, quantity_received, unit_cost, discount, products ( buy_uom_qty, batch_tracking, expiry_tracking, serial_tracking )').eq('po_id', o.id).eq('org_id', orgId),
      db.from('purchase_order_cost_lines').select('amount').eq('po_id', o.id).eq('org_id', orgId),
    ])
    type L = { id: string; product_id: string; quantity_ordered: number; quantity_received: number | null; unit_cost: number; discount: number | null; products: { buy_uom_qty: number | null; batch_tracking: boolean | null; expiry_tracking: boolean | null; serial_tracking: boolean | null } | null }
    const pl = (lines ?? []) as unknown as L[]
    const open = pl.filter(l => Number(l.quantity_ordered) - Number(l.quantity_received ?? 0) > 0)
    if (open.some(l => l.products?.batch_tracking || l.products?.expiry_tracking || l.products?.serial_tracking)) {
      fail('has batch, expiry or serial tracked items — use Receive so the details can be entered'); continue
    }
    const extraTotal = ((costRows ?? []) as { amount: number | null }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const extra = new Map<string, number>()
    if (extraTotal > 0) {
      for (const r of allocateLandedCost(method, extraTotal, pl.map(l => ({ id: l.id, qty: Number(l.quantity_ordered), unitCost: Number(l.unit_cost), discount: l.discount, factor: Number(l.products?.buy_uom_qty) || 1 })))) extra.set(r.id, r.extraPerUnit)
    }
    const { error } = await db.rpc('receive_purchase_order', {
      p_po: o.id, p_org: orgId,
      p_lines: open.map(l => ({ id: l.id, qty_to_receive: Number(l.quantity_ordered) - Number(l.quantity_received ?? 0), extra_unit_cost: extra.get(l.id) ?? 0, batch_num: null, expiry_date: null, serial_numbers: null })),
      p_user: name || email || userId, p_notes: 'Auto received', p_backorder: false, p_bin: null, p_date: null,
    })
    if (error) fail(error.message); else received.push({ id: o.id, po_number: o.po_number })
  }
  return NextResponse.json({ received, failed })
}
