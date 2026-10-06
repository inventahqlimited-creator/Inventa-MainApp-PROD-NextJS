import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { logHub } from '@/lib/hub/activity'
import { PLATFORM_ORG_ID, isEmail } from '@/lib/auth/platform-admin'
import { checkPassword, DEFAULT_POLICY, type PasswordPolicy } from '@/lib/auth/password-policy'

// Hub accounts can see every customer, so they get a stricter password rule than the app default.
const HUB_POLICY: PasswordPolicy = { ...DEFAULT_POLICY, strength: { enabled: true, min_length: 12, upper: true, lower: true, number: true, special: false } }

export async function POST(request: Request) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const email = String(b.email ?? '').trim().toLowerCase()
  const first = typeof b.first_name === 'string' ? b.first_name.trim().slice(0, 80) : ''
  const last = typeof b.last_name === 'string' ? b.last_name.trim().slice(0, 80) : ''
  const password = typeof b.password === 'string' ? b.password : ''
  if (!isEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!first) return NextResponse.json({ error: 'First name is required.' }, { status: 400 })
  const problems = checkPassword(password, HUB_POLICY)
  if (problems.length) return NextResponse.json({ error: `Password needs: ${problems.join(', ')}` }, { status: 400 })

  const { data: dup } = await g.db.from('org_members').select('id').eq('org_id', PLATFORM_ORG_ID).ilike('email', email).maybeSingle()
  if (dup) return NextResponse.json({ error: 'That person already has Hub access.' }, { status: 409 })

  const { data: created, error: cErr } = await g.db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { first_name: first, last_name: last },
  })
  if (cErr || !created?.user) {
    const taken = /already|registered|exists/i.test(cErr?.message ?? '')
    return NextResponse.json({ error: taken ? 'That email already has an inventaHQ login. Use a different email for Hub access.' : (cErr?.message ?? 'Could not create the login') }, { status: taken ? 409 : 500 })
  }

  const { error: mErr } = await g.db.from('org_members').insert({
    org_id: PLATFORM_ORG_ID, user_id: created.user.id, email, first_name: first, last_name: last || null,
    role: 'admin', invite_status: 'accepted', invited_at: new Date().toISOString(), password_changed_at: new Date().toISOString(),
  })
  if (mErr) {
    await g.db.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: 'Could not add the Hub user.' }, { status: 500 })
  }
  await logHub(g.db, { orgId: null, actorId: g.user.id, actorEmail: g.user.email, action: 'hub_user.created', summary: `Added Hub user ${email}` })
  return NextResponse.json({ success: true })
}
