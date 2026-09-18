// src/app/api/org/contact-custom-lists/route.ts
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

export async function GET() {
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: lists } = await auth.adminClient.from('contact_custom_lists').select('*').eq('org_id', auth.orgId).order('sort_order').order('created_at')
  const { data: options } = await auth.adminClient.from('contact_custom_list_options').select('*').eq('org_id', auth.orgId).order('sort_order').order('created_at')
  const result = (lists ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    options: (options ?? []).filter((o: Record<string, unknown>) => o.list_id === l.id).map((o: Record<string, unknown>) => ({ id: o.id, value: o.value }))
  }))
  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, sort_order } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const { data, error } = await auth.adminClient.from('contact_custom_lists')
    .insert({ org_id: auth.orgId, name: name.trim(), sort_order: sort_order ?? 0 })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, options: [] })
}
