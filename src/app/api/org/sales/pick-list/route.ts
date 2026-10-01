// src/app/api/org/sales/pick-list/route.ts
// GET /api/org/sales/pick-list?ids=a,b,c — everything needed to print a pick list for those orders:
// where each line should be picked from, plus the organisation's pick list template settings.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { loadPickListPayload } from '@/lib/pick-list/data'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200)
  if (ids.length === 0) return NextResponse.json({ error: 'No orders selected' }, { status: 400 })

  try {
    const payload = await loadPickListPayload(db, (m as { org_id: string }).org_id, ids)
    if (payload.orders.length === 0) return NextResponse.json({ error: 'None of these orders has anything to pick.' }, { status: 404 })
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the pick list' }, { status: 500 })
  }
}
