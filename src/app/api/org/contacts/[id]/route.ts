import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>, adminClient: ReturnType<typeof createAdminClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!membership) return null
  return { user, membership: membership as { org_id: string; role: string } }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const caller = await getMembership(supabase, adminClient)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { error } = await adminClient
    .from('contacts')
    .update(body)
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const caller = await getMembership(supabase, adminClient)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await adminClient
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
