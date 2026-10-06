import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isPlatformAdmin, isUuid, isEmail, isFixedRole } from '@/lib/auth/platform-admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!(await isPlatformAdmin(admin, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { email, orgId, role } = body as Record<string, unknown>
  if (!isEmail(email) || !isUuid(orgId)) return NextResponse.json({ error: 'email and orgId required' }, { status: 400 })

  // Only re-invite someone who really is a pending member of that organisation.
  const { data: member } = await admin
    .from('org_members')
    .select('role, invite_status')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()
  const m = member as { role: string; invite_status: string } | null
  if (!m) return NextResponse.json({ error: 'No such member' }, { status: 404 })
  if (m.invite_status === 'accepted') return NextResponse.json({ error: 'This user has already accepted' }, { status: 400 })

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: { org_id: orgId, role: isFixedRole(role) ? role : m.role },
  })

  if (error) {
    console.error('admin resend-invite failed', error.message)
    return NextResponse.json({ error: 'Could not send the invitation' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
