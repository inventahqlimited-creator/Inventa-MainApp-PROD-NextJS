// POST — cancel an Open credit note. Nothing had moved, so nothing needs undoing.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const g = await requirePerm('process_returns')
  if ('res' in g) return g.res
  const { orgId, db } = g.access
  const { id } = await params
  const { data, error } = await db.from('credit_notes').update({ status: 'Cancelled' }).eq('org_id', orgId).eq('id', id).eq('status', 'Open').select('cn_number, so_id, so_number').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Only an Open credit note can be cancelled.' }, { status: 409 })
  const cn = data as { cn_number: string; so_id: string; so_number: string | null }
  await db.rpc('audit_write', { p_org: orgId, p_cat: 'Sales', p_action: 'Credit Note Cancelled', p_ref: cn.cn_number, p_detail: `Credit note ${cn.cn_number} cancelled`, p_etype: 'sales_orders', p_eid: cn.so_id })
  return NextResponse.json({ new_status: 'Cancelled' })
}
