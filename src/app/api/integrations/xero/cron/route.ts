// src/app/api/integrations/xero/cron/route.ts
// POST — called every 5 minutes by the database scheduler (pg_cron). Runs the automatic sync for every organisation that is due.
// Protected by the XERO_CRON_SECRET header; it is not for browsers.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { safeEqual } from '@/lib/xero/crypto'
import { runScope } from '@/lib/xero/run'
import { intervalMs, normalizePrefs } from '@/lib/xero/prefs'
import type { XeroSettings } from '@/lib/xero/mapping'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOTAL_BUDGET_MS = 110_000
const LEASE_MS = 10 * 60_000   // a run that crashes is picked up again after this
const RETRY_MS = 5 * 60_000    // carry on soon when a run ran out of time

export async function POST(req: Request) {
  const secret = process.env.XERO_CRON_SECRET
  const sent = req.headers.get('x-cron-secret') ?? ''
  if (!secret || !sent || !safeEqual(sent, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const started = Date.now()
  const nowIso = () => new Date().toISOString()
  const { data: due } = await db.from('xero_connections').select('org_id, next_sync_at').eq('status', 'connected').not('next_sync_at', 'is', null).lte('next_sync_at', nowIso()).order('next_sync_at').limit(10)

  const results: { org: string; result: string }[] = []
  for (const d of (due ?? []) as { org_id: string; next_sync_at: string }[]) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started)
    if (left < 15_000) break

    // claim it: only one caller can move next_sync_at from the value it saw
    const { data: claimed } = await db.from('xero_connections').update({ next_sync_at: new Date(Date.now() + LEASE_MS).toISOString() })
      .eq('org_id', d.org_id).eq('next_sync_at', d.next_sync_at).select('settings, preferences').maybeSingle()
    if (!claimed) continue

    const c = claimed as { settings: XeroSettings | null; preferences: unknown }
    const prefs = normalizePrefs(c.preferences)
    const { data: org } = await db.from('organisations').select('xero_enabled').eq('id', d.org_id).single()
    if (prefs.schedule === 'manual' || !(org as { xero_enabled?: boolean } | null)?.xero_enabled) {
      await db.from('xero_connections').update({ next_sync_at: null }).eq('org_id', d.org_id)
      results.push({ org: d.org_id, result: 'skipped' })
      continue
    }

    try {
      const rep = await runScope(db, d.org_id, prefs.scope, c.settings ?? {}, prefs, { budgetMs: left - 5_000 })
      if (!rep.done) {
        // out of time or Xero said wait: try again soon (a refused connection waits a normal interval instead)
        const wait = rep.stopped && !/busy|rate/i.test(rep.stopped) ? (intervalMs(prefs.schedule) ?? RETRY_MS) : RETRY_MS
        await db.from('xero_connections').update({ next_sync_at: new Date(Date.now() + wait).toISOString() }).eq('org_id', d.org_id)
      }
      results.push({ org: d.org_id, result: rep.done ? 'done' : rep.stopped ?? 'partial' })
    } catch (e) {
      await db.from('xero_connections').update({ next_sync_at: new Date(Date.now() + RETRY_MS).toISOString() }).eq('org_id', d.org_id)
      results.push({ org: d.org_id, result: `error: ${e instanceof Error ? e.message : 'unknown'}` })
    }
  }
  return NextResponse.json({ ran: results.length, results })
}
