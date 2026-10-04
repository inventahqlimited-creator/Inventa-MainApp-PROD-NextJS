// src/lib/xero/run.ts
// One sync run for one organisation: used by "Sync now" on the dashboard and by the scheduled auto sync.
// Posts what isn't in Xero yet (contacts → products → invoices → bills) within a time budget. Safe to call again to carry on.
import type { SupabaseClient } from '@supabase/supabase-js'
import { runSync, type SyncSummary } from './sync'
import { postEligibleInvoices } from './invoice'
import { postEligibleBills } from './bill'
import type { XeroSettings } from './mapping'
import { nextSyncFrom, scopeIncludes, type Scope, type XeroPrefs } from './prefs'

type Db = SupabaseClient
export type Part = 'contacts' | 'products' | 'invoices' | 'bills'
type Posted = { posted: number; failed: number; remaining: number; failures: { id: string; name: string; error: string }[] }

export type RunReport = {
  done: boolean                 // nothing left to post within this scope
  stopped?: string              // Xero refused or rate-limited: the reason
  contacts?: SyncSummary
  products?: SyncSummary
  invoices?: Posted
  bills?: Posted
  lastSyncAt?: string
  lastFullSyncAt?: string | null
  nextSyncAt?: string | null
}

const merge = (a: Posted | undefined, b: Posted): Posted => ({
  posted: (a?.posted ?? 0) + b.posted, failed: (a?.failed ?? 0) + b.failed, remaining: b.remaining,
  failures: [...(a?.failures ?? []), ...b.failures].slice(0, 100),
})

/**
 * @param skip parts already finished in an earlier call of the same run (the dashboard passes these on when it asks again)
 * @param budgetMs how long this call may keep posting before it hands back (the caller asks again if `done` is false)
 */
export async function runScope(db: Db, orgId: string, scope: Scope, settings: XeroSettings, prefs: XeroPrefs, opts: { skip?: Part[]; budgetMs?: number } = {}): Promise<RunReport> {
  const deadline = Date.now() + (opts.budgetMs ?? 50_000)
  const want = scopeIncludes(scope)
  const skip = new Set(opts.skip ?? [])
  const rep: RunReport = { done: true }
  const stop = (reason: string) => { rep.stopped = reason; rep.done = false }

  for (const entity of ['contact', 'product'] as const) {
    const part = entity === 'contact' ? 'contacts' : 'products'
    if (!want[part] || skip.has(part) || rep.stopped) continue
    const r = await runSync(db, orgId, entity, { settings })
    if (!r.ok) { stop(r.error); break }
    rep[part] = r.summary
  }

  for (const part of ['invoices', 'bills'] as const) {
    if (!want[part] || skip.has(part) || rep.stopped) continue
    const post = part === 'invoices' ? postEligibleInvoices : postEligibleBills
    let acc: Posted | undefined
    // each call posts up to 20; keep going while there is time. Failures are only retried on the first pass.
    for (let round = 0; ; round++) {
      const r = await post(db, orgId, settings, prefs, round === 0, deadline)
      acc = merge(acc, r)
      if (r.stopped) { stop(r.stopped); break }
      if (r.remaining === 0) break
      if (Date.now() > deadline) { rep.done = false; break }
    }
    rep[part] = acc
  }

  if (rep.done) {
    const now = new Date()
    rep.lastSyncAt = now.toISOString()
    rep.nextSyncAt = nextSyncFrom(prefs.schedule, now)
    const patch: Record<string, unknown> = { last_sync_at: rep.lastSyncAt, next_sync_at: rep.nextSyncAt }
    if (scope === 'full') { patch.last_full_sync_at = rep.lastSyncAt; rep.lastFullSyncAt = rep.lastSyncAt }
    await db.from('xero_connections').update(patch).eq('org_id', orgId)
  }
  return rep
}
