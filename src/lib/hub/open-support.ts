// Shared by the Hub's "Open InventaHQ" (production) and "Open Staging InventaHQ" buttons.
// `hubDb` is the Hub's own database (who is asking, activity log); `appDb` is the database of the app being opened —
// the same database for production, the staging project's database for staging. Server-only.
import { PLATFORM_ORG_ID } from '@/lib/auth/platform-admin'
import { supportEmailFor, signSupportLink } from '@/lib/hub/support'
import { startLease, sweepExpired } from '@/lib/hub/support-lease'
import { logHub } from '@/lib/hub/activity'
import { randomBytes } from 'crypto'

type Result = { url: string } | { error: string; status: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function openSupport(opts: {
  hubDb: any
  appDb: any
  user: { id: string; email: string | null }
  orgId: string
  appBase: string
  linkKey?: string
  envLabel?: string            // e.g. 'Staging' — shown in names and the activity log
}): Promise<Result> {
  const { hubDb, appDb, user, orgId, appBase, linkKey, envLabel } = opts
  const app = envLabel ? `${envLabel} InventaHQ` : 'InventaHQ'

  await sweepExpired(appDb)
  const { data: org } = await appDb.from('organisations').select('id, name').eq('id', orgId).maybeSingle()
  if (!org) {
    return envLabel
      ? { error: `This organisation isn’t on ${envLabel.toLowerCase()} yet — it is copied over from production every night at 3am NZ time.`, status: 404 }
      : { error: 'Organisation not found', status: 404 }
  }

  // who is asking (name + email go on every audit entry) — always read from the Hub's own database
  const { data: me } = await hubDb.from('org_members').select('first_name, last_name, email')
    .eq('user_id', user.id).eq('org_id', PLATFORM_ORG_ID).eq('invite_status', 'accepted').maybeSingle()
  const mm = me as { first_name: string | null; last_name: string | null; email: string | null } | null
  const realName = [mm?.first_name, mm?.last_name].filter(Boolean).join(' ') || 'Inventa admin'
  const realEmail = user.email ?? mm?.email ?? ''
  const first = realName
  const last = `(Super Admin · ${realEmail})`

  const email = supportEmailFor(user.id, orgId)
  const { data: existing } = await appDb.from('org_members').select('id, user_id').eq('org_id', orgId).eq('email', email).maybeSingle()
  let authId = (existing as { user_id: string | null } | null)?.user_id ?? null

  if (!authId) {
    const { data: created, error } = await appDb.auth.admin.createUser({
      email, email_confirm: true, password: randomBytes(32).toString('hex'),
      user_metadata: { support: true },
    })
    if (error || !created?.user) return { error: 'Could not create the support login.', status: 500 }
    authId = created.user.id
  } else {
    await appDb.auth.admin.updateUserById(authId, { ban_duration: 'none' })
  }

  const now = new Date().toISOString()
  const row = { first_name: first, last_name: last, role: 'admin', custom_role_id: null, invite_status: 'accepted', designation: 'Inventa Support', password_changed_at: now }
  if (existing) {
    const { error } = await appDb.from('org_members').update(row).eq('id', (existing as { id: string }).id)
    if (error) return { error: 'Could not prepare the support access.', status: 500 }
  } else {
    const { error } = await appDb.from('org_members').insert({ ...row, org_id: orgId, user_id: authId, email, accepted_at: now })
    if (error) {
      await appDb.auth.admin.deleteUser(authId)
      return { error: 'Could not prepare the support access.', status: 500 }
    }
  }

  if (!(await startLease(appDb, authId as string, orgId, user.id))) {
    return { error: `Support sessions aren’t set up yet${envLabel ? ` on ${envLabel.toLowerCase()}` : ''} — run support-sessions.sql in Supabase first.`, status: 500 }
  }

  const { data: link, error: lErr } = await appDb.auth.admin.generateLink({ type: 'magiclink', email })
  const th = link?.properties?.hashed_token
  if (lErr || !th) return { error: 'Could not start the support session.', status: 500 }

  const { exp, sig } = signSupportLink(th, orgId, 120, linkKey)
  await logHub(hubDb, {
    orgId, actorId: user.id, actorEmail: user.email,
    action: envLabel ? `support.opened_${envLabel.toLowerCase()}` : 'support.opened',
    summary: `Opened ${app} as Super Admin (${realName})`,
  })

  return { url: `${appBase.replace(/\/$/, '')}/auth/support?th=${encodeURIComponent(th)}&o=${orgId}&exp=${exp}&sig=${sig}` }
}
