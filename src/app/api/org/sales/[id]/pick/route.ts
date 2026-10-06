// src/app/api/org/sales/[id]/pick/route.ts
// Confirm Pick — saves which stock (bin / batch / serial / expiry) each line was picked from.
// In Pick Only mode a fully picked order is closed straight away.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const permGate = await requirePerm('pick_sales')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const { data: cur } = await db.from('sales_orders').select('status').eq('id', id).eq('org_id', orgId).single()
  if (String((cur as { status?: string } | null)?.status ?? '').toLowerCase() === 'quote') {
    return NextResponse.json({ error: 'A quote can\'t be picked or packed. Convert it to a sales order first.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const lines = Array.isArray(body.lines) ? body.lines : []

  const { data, error } = await db.rpc('pick_sales_order', { p_so: id, p_org: orgId, p_lines: lines, p_user: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? {})
}
