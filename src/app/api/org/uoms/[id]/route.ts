// src/app/api/org/uoms/[id]/route.ts
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: m.org_id, adminClient } : null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permGate = await requirePerm('manage_product_settings')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.abbr !== undefined) updates.abbr = body.abbr.trim()
  const { error } = await auth.adminClient.from('uoms').update(updates).eq('id', id).eq('org_id', auth.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permGate = await requirePerm('manage_product_settings')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await auth.adminClient.from('uoms').delete().eq('id', id).eq('org_id', auth.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
