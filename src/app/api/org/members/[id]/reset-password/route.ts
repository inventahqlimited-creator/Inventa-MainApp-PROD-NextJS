// src/app/api/org/members/[id]/reset-password/route.ts
// Admin sends a member a password reset email.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('org_members').select('role, org_id').eq('user_id', user.id).eq('invite_status', 'accepted').limit(1).maybeSingle()
  const caller = me as { role: string; org_id: string } | null
  if (!caller || caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: t } = await db.from('org_members').select('user_id, email, invite_status').eq('id', id).eq('org_id', caller.org_id).maybeSingle()
  const target = t as { user_id: string | null; email: string | null; invite_status: string } | null
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.invite_status === 'pending' || !target.user_id) {
    return NextResponse.json({ error: 'This user has not accepted their invite yet — resend the invite instead.' }, { status: 400 })
  }

  let email = target.email
  if (!email) {
    const { data } = await db.auth.admin.getUserById(target.user_id)
    email = data?.user?.email ?? null
  }
  if (!email) return NextResponse.json({ error: 'No email address on file for this user' }, { status: 400 })

  const origin = new URL(request.url).origin
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, email })
}
