import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  const m = membership as { role: string; org_id: string } | null
  if (!m || m.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, role } = await request.json()
  if (!email || !role) {
    return NextResponse.json({ error: 'email and role are required' }, { status: 400 })
  }

  const validRoles = ['admin', 'manager', 'staff', 'read_only']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('org_members')
    .select('id, invite_status')
    .eq('org_id', m.org_id)
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    const msg = existing.invite_status === 'pending'
      ? 'An invite is already pending for this email'
      : 'This email is already a member of your organisation'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const adminClient = createAdminClient()

  const { error: insertError } = await adminClient
    .from('org_members')
    .insert({
      org_id: m.org_id,
      role,
      email,
      invite_status: 'pending',
      invited_at: new Date().toISOString(),
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: { org_id: m.org_id, role },
  })

  if (inviteError) {
    await adminClient.from('org_members').delete().eq('org_id', m.org_id).eq('email', email)
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
