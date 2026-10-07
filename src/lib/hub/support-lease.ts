// Support sessions are short leases, not long logins.
//  • The open tab renews the lease every PING seconds.
//  • Closing the tab sends a "leaving" beacon that shortens the lease to GRACE seconds (long enough for a reload or
//    another open tab to renew it, short enough that a real close ends the session almost at once).
//  • A lapsed lease blocks all access immediately, and the support login is then switched off for good (ended).
// Server-only.
import { isSupportEmail } from '@/lib/hub/support'

export const LEASE_SECONDS = 150   // normal renewal (generous: background tabs are throttled by browsers)
export const GRACE_SECONDS = 25    // after a "leaving" beacon
export const OPEN_SECONDS = 90     // time allowed between clicking "Open InventaHQ" and the app loading
export const PING_MS = 15_000

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function startLease(db: any, userId: string, orgId: string, startedBy: string, seconds = OPEN_SECONDS): Promise<boolean> {
  const { error } = await db.from('support_sessions').upsert({ user_id: userId, org_id: orgId, started_by: startedBy, lease_until: at(seconds) }, { onConflict: 'user_id' })
  return !error
}

export async function renewLease(db: any, userId: string, seconds = LEASE_SECONDS): Promise<boolean> {
  const { data } = await db.from('support_sessions').update({ lease_until: at(seconds) }).eq('user_id', userId).gt('lease_until', new Date().toISOString()).select('user_id')
  return ((data ?? []) as unknown[]).length > 0
}

/** Shorten (never extend) the lease — used by the tab-closing beacon. */
export async function shortenLease(db: any, userId: string, seconds = GRACE_SECONDS): Promise<boolean> {
  const { data } = await db.from('support_sessions').update({ lease_until: at(seconds) }).eq('user_id', userId)
    .gt('lease_until', at(seconds)).select('user_id')
  return ((data ?? []) as unknown[]).length > 0
}

export async function leaseValid(db: any, userId: string): Promise<boolean> {
  const { data } = await db.from('support_sessions').select('lease_until').eq('user_id', userId).maybeSingle()
  const t = (data as { lease_until?: string } | null)?.lease_until
  return !!t && new Date(t).getTime() > Date.now()
}

/** Ends the support access for good: membership off, login blocked, lease removed. */
export async function endSupport(db: any, userId: string): Promise<void> {
  await db.from('org_members').update({ invite_status: 'inactive' }).eq('user_id', userId)
  await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  await db.from('support_sessions').delete().eq('user_id', userId)
}

/** Ends every support session whose lease has lapsed. Cheap; called from several places as a backstop. */
export async function sweepExpired(db: any): Promise<number> {
  try {
    const { data } = await db.from('support_sessions').select('user_id').lt('lease_until', new Date().toISOString()).limit(50)
    const rows = (data ?? []) as { user_id: string }[]
    for (const r of rows) await endSupport(db, r.user_id)
    return rows.length
  } catch { return 0 }
}

/** After a "leaving" beacon: if nothing renewed the lease within the grace period, end the session right then. */
export function endSoonIfUnrenewed(db: any, userId: string) {
  setTimeout(async () => {
    try { if (!(await leaseValid(db, userId))) await endSupport(db, userId) } catch { /* sweep will catch it */ }
  }, (GRACE_SECONDS + 3) * 1000)
}

export { isSupportEmail }
