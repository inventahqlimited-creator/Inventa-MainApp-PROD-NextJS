import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

export async function POST(request: Request) {
  const g = await requirePerm('manage_users')
  if ('res' in g) return g.res
  const supabase = g.access.db
  const m = { org_id: g.access.orgId }

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
