import { NextResponse } from 'next/server'
import { sendInvite } from '@/lib/auth/send-invite'
import { inviteData } from '@/lib/auth/invite-data'
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
  const sent = await sendInvite(admin, email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: await inviteData(admin, m.org_id, p.role),
  })

  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status })
  return NextResponse.json({ success: true })
}
