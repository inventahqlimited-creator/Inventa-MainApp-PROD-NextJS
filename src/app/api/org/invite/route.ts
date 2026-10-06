import { NextResponse } from 'next/server'
import { isSupportEmail } from '@/lib/hub/support'
import { createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'
import { checkSeatLimit } from '@/lib/hub/seats'

export async function POST(request: Request) {
  const g = await requirePerm('manage_users')
  if ('res' in g) return g.res
  const m = { org_id: g.access.orgId }
  const supabase = g.access.db

  const body = await request.json().catch(() => ({}))
  const { role } = body
  const email = String(body.email ?? '').trim().toLowerCase()
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  if (!email || !role) {
    return NextResponse.json({ error: 'email and role are required' }, { status: 400 })
  }

  if (isSupportEmail(String(email))) return NextResponse.json({ error: 'That address can’t be invited.' }, { status: 400 })
  const validRoles = ['admin', 'manager', 'staff', 'read_only']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  // only an Administrator can make another Administrator
  if (role === 'admin' && !g.access.isAdmin) return NextResponse.json({ error: 'Only an Administrator can invite another Administrator.' }, { status: 403 })

  // one of the organisation's own roles (the fixed role stays "staff" underneath)
  let customRoleId: string | null = null
  if (typeof body.custom_role_id === 'string' && body.custom_role_id) {
    if (role === 'admin') return NextResponse.json({ error: 'An Administrator can’t have a custom role.' }, { status: 400 })
    const { data: cr } = await supabase.from('org_roles').select('id').eq('id', body.custom_role_id).eq('org_id', m.org_id).maybeSingle()
    if (!cr) return NextResponse.json({ error: 'That role no longer exists.' }, { status: 400 })
    customRoleId = body.custom_role_id
  }

  const { data: existing } = await supabase
    .from('org_members')
    .select('id, invite_status')
    .eq('org_id', m.org_id)
    .ilike('email', email)
    .maybeSingle()

  const existingMember = existing as { id: string; invite_status: string } | null
  if (existingMember) {
    const msg = existingMember.invite_status === 'pending'
      ? 'An invite is already pending for this email'
      : 'This email is already a member of your organisation'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const seat = await checkSeatLimit(supabase, m.org_id)
  if (!seat.ok) return NextResponse.json({ error: seat.message, code: 'user_limit' }, { status: 403 })

  const adminClient = createAdminClient()

  const { error: insertError } = await adminClient
    .from('org_members')
    .insert({
      org_id: m.org_id,
      role,
      custom_role_id: customRoleId,
      email,
      first_name: str(body.first_name, 80),
      last_name: str(body.last_name, 80),
      phone: str(body.phone, 40),
      designation: str(body.designation, 80),
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
