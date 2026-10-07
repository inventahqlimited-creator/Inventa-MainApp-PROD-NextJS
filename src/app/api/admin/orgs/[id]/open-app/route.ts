// Hub → "Open InventaHQ": signs the Hub admin in to the app as an administrator of this organisation.
import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { logHub } from '@/lib/hub/activity'
import { isUuid, PLATFORM_ORG_ID } from '@/lib/auth/platform-admin'
import { supportEmailFor, signSupportLink, appUrl } from '@/lib/hub/support'
import { startLease, sweepExpired } from '@/lib/hub/support-lease'
import { randomBytes } from 'crypto'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  if (id === PLATFORM_ORG_ID) return NextResponse.json({ error: 'This is the internal Hub organisation — there is no customer app to open.' }, { status: 400 })

  const { db, user } = g
  await sweepExpired(db)
  const { data: org } = await db.from('organisations').select('id, name').eq('id', id).maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  // who is asking (name + email go on every audit entry)
  const { data: me } = await db.from('org_members').select('first_name, last_name, email')
    .eq('user_id', user.id).eq('org_id', PLATFORM_ORG_ID).eq('invite_status', 'accepted').maybeSingle()
  const mm = me as { first_name: string | null; last_name: string | null; email: string | null } | null
  const realName = [mm?.first_name, mm?.last_name].filter(Boolean).join(' ') || 'Inventa admin'
  const realEmail = user.email ?? mm?.email ?? ''
  const first = realName
  const last = `(Super Admin · ${realEmail})`

  const email = supportEmailFor(user.id, id)
  const { data: existing } = await db.from('org_members').select('id, user_id').eq('org_id', id).eq('email', email).maybeSingle()
  let authId = (existing as { user_id: string | null } | null)?.user_id ?? null

  if (!authId) {
    const { data: created, error } = await db.auth.admin.createUser({
      email, email_confirm: true, password: randomBytes(32).toString('hex'),
      user_metadata: { support: true },
    })
    if (error || !created?.user) return NextResponse.json({ error: 'Could not create the support login.' }, { status: 500 })
    authId = created.user.id
  } else {
    await db.auth.admin.updateUserById(authId, { ban_duration: 'none' })
  }

  const now = new Date().toISOString()
  const row = { first_name: first, last_name: last, role: 'admin', custom_role_id: null, invite_status: 'accepted', designation: 'Inventa Support', password_changed_at: now }
  if (existing) {
    const { error } = await db.from('org_members').update(row).eq('id', (existing as { id: string }).id)
    if (error) return NextResponse.json({ error: 'Could not prepare the support access.' }, { status: 500 })
  } else {
    const { error } = await db.from('org_members').insert({ ...row, org_id: id, user_id: authId, email, accepted_at: now })
    if (error) {
      await db.auth.admin.deleteUser(authId)
      return NextResponse.json({ error: 'Could not prepare the support access.' }, { status: 500 })
    }
  }

  if (!(await startLease(db, authId as string, id, user.id))) {
    return NextResponse.json({ error: 'Support sessions aren’t set up yet — run support-sessions.sql in Supabase first.' }, { status: 500 })
  }

  const { data: link, error: lErr } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const th = link?.properties?.hashed_token
  if (lErr || !th) return NextResponse.json({ error: 'Could not start the support session.' }, { status: 500 })

  const { exp, sig } = signSupportLink(th, id)
  await logHub(db, { orgId: id, actorId: user.id, actorEmail: user.email, action: 'support.opened', summary: `Opened InventaHQ as Super Admin (${realName})` })

  const url = `${appUrl()}/auth/support?th=${encodeURIComponent(th)}&o=${id}&exp=${exp}&sig=${sig}`
  return NextResponse.json({ url })
}
