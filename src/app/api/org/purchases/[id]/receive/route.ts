// src/app/api/org/purchases/[id]/receive/route.ts
// Receives stock against a purchase order. All the work (stock on hand, on order,
// movements, costs, PO status) happens in one database transaction:
// public.receive_purchase_order(...)
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'
import { allocateLandedCost, normalizeMethod } from '@/lib/purchases/landed-cost'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const permGate = await requirePerm('receive_purchases')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const body = await request.json()
  const lines = Array.isArray(body.lines) ? body.lines : []
  if (lines.length === 0) return NextResponse.json({ error: 'Nothing to receive.' }, { status: 400 })

  // Landed cost: share the order's additional costs over its lines, so received stock is costed with its share
  const [{ data: org }, { data: poLines }, { data: costRows }] = await Promise.all([
    adminClient.from('organisations').select('landing_cost_method').eq('id', orgId).single(),
    adminClient.from('purchase_order_lines').select('id, product_id, quantity_ordered, unit_cost, discount').eq('po_id', id).eq('org_id', orgId),
    adminClient.from('purchase_order_cost_lines').select('amount').eq('po_id', id).eq('org_id', orgId),
  ])
  const pl = (poLines ?? []) as { id: string; product_id: string; quantity_ordered: number; unit_cost: number; discount: number | null }[]
  const extraTotal = ((costRows ?? []) as { amount: number | null }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const extraByLine = new Map<string, number>()
  if (extraTotal > 0 && pl.length) {
    const { data: prods } = await adminClient.from('products').select('id, buy_uom_qty').eq('org_id', orgId).in('id', pl.map(l => l.product_id))
    const factor = new Map(((prods ?? []) as { id: string; buy_uom_qty: number | null }[]).map(p => [p.id, Number(p.buy_uom_qty) || 1]))
    const res = allocateLandedCost(normalizeMethod((org as { landing_cost_method?: string } | null)?.landing_cost_method), extraTotal, pl.map(l => ({
      id: l.id, qty: Number(l.quantity_ordered), unitCost: Number(l.unit_cost), discount: l.discount, factor: factor.get(l.product_id) ?? 1,
    })))
    for (const r of res) extraByLine.set(r.id, r.extraPerUnit)
  }

  const who =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email ||
    'User'

  const { data, error } = await adminClient.rpc('receive_purchase_order', {
    p_po: id,
    p_org: orgId,
    p_lines: lines.map((l: Record<string, unknown>) => ({
      id: l.id,
      extra_unit_cost: extraByLine.get(String(l.id)) ?? 0, // landed cost per stock unit, worked out here — never taken from the browser
      qty_to_receive: Number(l.qty_to_receive) || 0,
      batch_num: l.batch_num ?? null,
      expiry_date: l.expiry_date ?? null,
      serial_numbers: Array.isArray(l.serial_numbers) ? l.serial_numbers : null,
    })),
    p_user: who,
    p_notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    p_backorder: body.backorder === true,
    p_bin: typeof body.bin === 'string' && body.bin.trim() ? body.bin.trim() : null,
    p_date: typeof body.receive_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.receive_date) ? body.receive_date : null,
  })

  // Validation messages raised in the database (e.g. "only 3 left to receive") come back as error.message
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data as { new_status: string; backorder_id?: string; backorder_number?: string })
}
