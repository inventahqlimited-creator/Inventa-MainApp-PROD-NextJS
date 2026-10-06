// src/app/api/org/sales/[id]/close/route.ts
// Close Order — used when Settings → Sales → Fulfilment Mode is "None".
// Allocates stock automatically (picking rule, FIFO by default; batch / serial / expiry / bin included) and closes the order.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const permGate = await requirePerm('close_sales')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  // Orders that haven't been picked are only closed directly when Fulfilment Mode is "None"
  const { data: org } = await db.from('organisations').select('fulfilment_mode').eq('id', orgId).single()
  const { data: so } = await db.from('sales_orders').select('status').eq('id', id).eq('org_id', orgId).single()
  const status = String((so as { status?: string } | null)?.status ?? '').toLowerCase()
  if (status === 'quote') return NextResponse.json({ error: 'A quote can\'t be closed. Convert it to a sales order first.' }, { status: 400 })
  const picking = ['picking', 'partially picked', 'picked', 'packed'].includes(status)
  const mode = (org as { fulfilment_mode?: string | null } | null)?.fulfilment_mode ?? 'full'
  if (!picking && mode !== 'none') {
    return NextResponse.json({ error: 'Pick this order first — use Pick Order.' }, { status: 400 })
  }

  const { data, error } = await db.rpc('close_sales_order', { p_so: id, p_org: orgId, p_user: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? { new_status: 'Closed' })
}
