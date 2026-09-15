import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { data, error } = await adminClient
    .from('products')
    .insert({ ...body, org_id: (m as { org_id: string }).org_id })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id })
}
