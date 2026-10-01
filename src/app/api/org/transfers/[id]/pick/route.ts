// src/app/api/org/transfers/[id]/pick/route.ts
// Confirm Pick — saves which stock (bin / batch / serial / expiry) each line is picked from at the From location.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const body = await req.json().catch(() => ({}))
  const lines = Array.isArray(body.lines) ? body.lines : []

  const { data, error } = await db.rpc('pick_transfer_order', { p_tr: id, p_org: orgId, p_lines: lines, p_user: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? {})
}
