// src/app/api/org/sales/bulk-close/route.ts
// Close several sales orders at once. Only orders that are Packed are closed — everything else is left alone.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

export async function POST(req: Request) {
  const permGate = await requirePerm('close_sales')
  if ('res' in permGate) return permGate.res
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'No orders selected' }, { status: 400 })

  const { data: orders } = await db.from('sales_orders').select('id, so_number, status').eq('org_id', orgId).in('id', ids)
  const rows = (orders ?? []) as { id: string; so_number: string | null; status: string }[]

  const closed: string[] = []
  const failed: { so_number: string; error: string }[] = []
  let skipped = 0
  for (const o of rows) {
    if (String(o.status).toLowerCase() !== 'packed') { skipped++; continue }
    const { error } = await db.rpc('close_sales_order', { p_so: o.id, p_org: orgId, p_user: user.id })
    if (error) failed.push({ so_number: o.so_number ?? o.id, error: error.message })
    else closed.push(o.so_number ?? o.id)
  }
  return NextResponse.json({ closed, failed, skipped })
}
