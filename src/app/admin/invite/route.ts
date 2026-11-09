import { NextResponse } from 'next/server'
import { sendInvite } from '@/lib/auth/send-invite'
import { inviteData } from '@/lib/auth/invite-data'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  // Verify caller is an admin
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

  const { email, orgId, role } = await request.json()
  if (!email || !orgId) {
    return NextResponse.json({ error: 'email and orgId are required' }, { status: 400 })
  }

  // Use admin client to send invite — bypasses RLS
  const adminClient = createAdminClient()

  const sent = await sendInvite(adminClient, email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    data: await inviteData(adminClient, orgId, role),
  })

  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: sent.status })
  }

  return NextResponse.json({ success: true })
}
