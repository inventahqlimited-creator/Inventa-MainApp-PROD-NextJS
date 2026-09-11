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

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const { data: pending } = await supabase
    .from('org_members')
    .select('id, role, invite_status')
    .eq('org_id', m.org_id)
    .eq('email', email)
    .single()

  const p = pending as { id: string; role: string; invite_status: string } | null

  if (!p) {
    return NextResponse.json({ error: 'Member not found in your organisation' }, { status: 404 })
  }
  if (p.invite_status !== 'pending') {
    return NextResponse.json({ error: 'Invite is not in pending state' }, { status: 409 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: { org_id: m.org_id, role: p.role },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
