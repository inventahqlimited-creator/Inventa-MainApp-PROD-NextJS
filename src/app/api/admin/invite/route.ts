import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const m = membership as { role: string } | null
  if (!m || m.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, orgId, role, firstName, lastName } = await request.json()
  if (!email || !orgId) {
    return NextResponse.json({ error: 'email and orgId are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: memberErr } = await admin
    .from('org_members')
    .insert({
      org_id:        orgId,
      first_name:    firstName || null,
      last_name:     lastName || null,
      email:         email,
      role:          role || 'staff',
      invite_status: 'pending',
    })

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: { org_id: orgId, role },
  })

  if (inviteErr) {
    await admin.from('org_members').delete().eq('org_id', orgId).eq('email', email)
    return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
