// src/app/api/auth/password/route.ts
// Sets the signed-in person's password after checking it against their organisation's policy,
// and records the change date (used by the "change every N days" rule).
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkPassword, normalizePolicy, requirementsText } from '@/lib/auth/password-policy'
import { rateLimit } from '@/lib/rate-limit'

async function context() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).order('accepted_at', { ascending: true, nullsFirst: false }).limit(1).maybeSingle()
  let policy = normalizePolicy(null)
  if (m?.org_id) {
    const { data: org } = await db.from('organisations').select('password_policy').eq('id', m.org_id).single()
    policy = normalizePolicy((org as { password_policy?: unknown } | null)?.password_policy)
  }
  return { user, db, policy }
}

/** What the set-password screen should tell the person. */
export async function GET() {
  const c = await context()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ requirements: requirementsText(c.policy) })
}

export async function POST(req: Request) {
  const c = await context()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!rateLimit(`setpw:${c.user.id}`, 10, 60 * 60 * 1000).ok) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''
  const problems = checkPassword(password, c.policy)
  if (problems.length) return NextResponse.json({ error: `Password must include ${problems.join(', ')}.` }, { status: 400 })

  const { error } = await c.db.auth.admin.updateUserById(c.user.id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await c.db.from('org_members').update({ password_changed_at: new Date().toISOString() }).eq('user_id', c.user.id)
  return NextResponse.json({ success: true })
}
