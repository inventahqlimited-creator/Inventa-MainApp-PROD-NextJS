// src/app/api/org/transfers/bulk-complete/route.ts
// Complete several transfers at once. Only transfers that are Picked are completed — everything else is left alone.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

export async function POST(req: Request) {
  const permGate = await requirePerm('complete_transfers')
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
  if (ids.length === 0) return NextResponse.json({ error: 'No transfers selected' }, { status: 400 })

  const { data: rows } = await db.from('transfer_orders').select('id, tr_number, status').eq('org_id', orgId).in('id', ids)
  const list = (rows ?? []) as { id: string; tr_number: string | null; status: string }[]

  const completed: string[] = []
  const failed: { tr_number: string; error: string }[] = []
  let skipped = 0
  for (const t of list) {
    if (String(t.status).toLowerCase() !== 'picked') { skipped++; continue }
    const { error } = await db.rpc('complete_transfer_order', { p_tr: t.id, p_org: orgId, p_user: user.id })
    if (error) failed.push({ tr_number: t.tr_number ?? t.id, error: error.message })
    else completed.push(t.tr_number ?? t.id)
  }
  return NextResponse.json({ completed, failed, skipped })
}
