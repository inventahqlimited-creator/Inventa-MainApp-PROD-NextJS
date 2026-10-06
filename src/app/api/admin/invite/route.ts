import { NextResponse } from 'next/server'
import { isSupportEmail } from '@/lib/hub/support'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkSeatLimit } from '@/lib/hub/seats'
import { isPlatformAdmin, isUuid, isEmail, isFixedRole } from '@/lib/auth/platform-admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!(await isPlatformAdmin(admin, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, orgId, role, firstName, lastName } = body as Record<string, unknown>
  if (!isEmail(email) || !isUuid(orgId)) {
    return NextResponse.json({ error: 'A valid email and organisation are required' }, { status: 400 })
  }
  if (isSupportEmail(String(email))) return NextResponse.json({ error: 'That address can’t be invited.' }, { status: 400 })
  const memberRole = role === undefined || role === '' ? 'staff' : role
  if (!isFixedRole(memberRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null)

  const { data: org } = await admin.from('organisations').select('id').eq('id', orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const seat = await checkSeatLimit(admin, orgId as string)
  if (!seat.ok) return NextResponse.json({ error: `${seat.used} of ${seat.limit} users already used. Raise the user limit on the organisation first.` }, { status: 403 })

  const { error: memberErr } = await admin
    .from('org_members')
    .insert({
      org_id:        orgId,
      first_name:    clean(firstName),
      last_name:     clean(lastName),
      email:         email,
      role:          memberRole,
      invite_status: 'pending',
    })

  if (memberErr) {
    console.error('admin invite: member insert failed', memberErr.message)
    return NextResponse.json({ error: 'Could not create the member' }, { status: 500 })
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: { org_id: orgId, role: memberRole },
  })

  if (inviteErr) {
    console.error('admin invite: email failed', inviteErr.message)
    await admin.from('org_members').delete().eq('org_id', orgId).eq('email', email)
    return NextResponse.json({ error: 'Could not send the invitation' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
