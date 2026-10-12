// src/app/api/org/transfers/[id]/unpick/route.ts
// Unpicked — stock released, transfer back to Open — pick_transfers permission. Runs unpick_transfer_order, then writes the Audit Log / Order History entry.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const g = await requirePerm('pick_transfers')
  if ('res' in g) return g.res
  const { id } = await params
  const { db, orgId, userId, name } = g.access
  const { data: row } = await db.from('transfer_orders').select('tr_number').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await db.rpc('unpick_transfer_order', { p_tr: id, p_org: orgId, p_user: userId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const ref = (row as unknown as Record<string, string | null>)['tr_number']
  await db.from('audit_log').insert({
    org_id: orgId, category: 'Transfers', action: 'Transfer Unpicked', ref, detail: 'Unpicked — stock released, transfer back to Open', entity_type: 'transfer_orders', entity_id: id, user_id: userId, user_name: name,
  })
  return NextResponse.json(data ?? {})
}
