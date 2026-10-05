// src/app/api/org/members/[id]/reset-password/route.ts
// Admin sends a member a password reset email.
import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const g = await requirePerm('manage_users')
  if ('res' in g) return g.res
  const db = g.access.db as ReturnType<typeof createAdminClient>
  const caller = { org_id: g.access.orgId }

  const { data: t } = await db.from('org_members').select('user_id, email, invite_status, role').eq('id', id).eq('org_id', caller.org_id).maybeSingle()
  const target = t as { user_id: string | null; email: string | null; invite_status: string; role: string } | null
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'admin' && !g.access.isAdmin) return NextResponse.json({ error: 'Only an Administrator can reset an Administrator’s password.' }, { status: 403 })
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
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, email })
}
