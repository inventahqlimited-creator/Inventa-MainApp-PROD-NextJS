// src/app/api/org/contact-custom-lists/[id]/options/route.ts
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: m.org_id, adminClient } : null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: list_id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { value } = await req.json()
  if (!value?.trim()) return NextResponse.json({ error: 'Value is required' }, { status: 400 })
  const { data, error } = await auth.adminClient.from('contact_custom_list_options')
    .insert({ list_id, org_id: auth.orgId, value: value.trim() })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: list_id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { option_id } = await req.json()
  const { error } = await auth.adminClient.from('contact_custom_list_options')
    .delete().eq('id', option_id).eq('list_id', list_id).eq('org_id', auth.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
