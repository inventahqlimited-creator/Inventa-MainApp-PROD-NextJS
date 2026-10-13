// src/app/api/org/sales/[id]/unpack/route.ts
// Unpacked — packing details removed, order back to Picked — pack_sales permission. Runs unpack_sales_order, then writes the Audit Log / Order History entry.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const g = await requirePerm('pack_sales')
  if ('res' in g) return g.res
  const { id } = await params
  const { db, orgId, userId, name } = g.access
  const { data: row } = await db.from('sales_orders').select('so_number').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await db.rpc('unpack_sales_order', { p_so: id, p_org: orgId, p_user: userId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const ref = (row as unknown as Record<string, string | null>)['so_number']
  await db.from('audit_log').insert({
    org_id: orgId, category: 'Sales', action: 'Order Unpacked', ref, detail: 'Unpacked — packing details removed, order back to Picked', entity_type: 'sales_orders', entity_id: id, user_id: userId, user_name: name,
  })
  return NextResponse.json(data ?? {})
}
