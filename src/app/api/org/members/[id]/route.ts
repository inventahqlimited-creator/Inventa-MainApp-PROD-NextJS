import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

async function getCallerMembership(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('org_members')
    .select('role, org_id, user_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership || membership.role !== 'admin') return null
  return { user, membership: membership as { role: string; org_id: string; user_id: string } }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const caller = await getCallerMembership(supabase)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { role } = await request.json()
  const validRoles = ['admin', 'manager', 'staff', 'read_only']
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { data: target } = await supabase
    .from('org_members')
    .select('id, user_id, org_id, invite_status')
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)
    .single()

  const t = target as { id: string; user_id: string; org_id: string; invite_status: string } | null
  if (!t) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  if (t.user_id === caller.user.id) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
  }

  const { error } = await supabase
    .from('org_members')
    .update({ role })
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const caller = await getCallerMembership(supabase)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: target } = await supabase
    .from('org_members')
    .select('id, user_id, org_id')
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)
    .single()

  const t = target as { id: string; user_id: string; org_id: string } | null
  if (!t) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  if (t.user_id === caller.user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { error: deleteError } = await supabase
    .from('org_members')
    .delete()
    .eq('id', id)
    .eq('org_id', caller.membership.org_id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (t.user_id) {
    await adminClient.auth.admin.updateUser(t.user_id, {
      ban_duration: '876000h',
    })
  }

  return NextResponse.json({ success: true })
}
