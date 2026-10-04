// src/app/api/integrations/xero/preferences/route.ts
// GET — posting choices, schedule, last/next sync times and the organisation's time zone (any member).
// PUT — save the choices (admin only). Changing the schedule restarts the countdown to the next automatic sync.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { nextSyncFrom, normalizePrefs } from '@/lib/xero/prefs'

export const dynamic = 'force-dynamic'

async function read(g: Exclude<Awaited<ReturnType<typeof guardXero>>, { res: NextResponse }>) {
  const [{ data: conn }, { data: org }] = await Promise.all([
    g.a.db.from('xero_connections').select('last_sync_at, last_full_sync_at, next_sync_at').eq('org_id', g.a.orgId).maybeSingle(),
    g.a.db.from('organisations').select('timezone').eq('id', g.a.orgId).single(),
  ])
  const c = conn as { last_sync_at: string | null; last_full_sync_at: string | null; next_sync_at: string | null } | null
  return {
    prefs: g.prefs,
    lastSyncAt: c?.last_sync_at ?? null,
    lastFullSyncAt: c?.last_full_sync_at ?? null,
    nextSyncAt: g.prefs.schedule === 'manual' ? null : c?.next_sync_at ?? null,
    timezone: (org as { timezone?: string | null } | null)?.timezone || 'Pacific/Auckland',
    canEdit: g.a.isAdmin,
  }
}

export async function GET() {
  const g = await guardXero(false)
  if ('res' in g) return g.res
  return NextResponse.json(await read(g))
}

export async function PUT(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))
  const prefs = normalizePrefs(body)

  const patch: Record<string, unknown> = { preferences: prefs }
  if (prefs.schedule !== g.prefs.schedule) patch.next_sync_at = nextSyncFrom(prefs.schedule) // restart the countdown
  const { error } = await g.a.db.from('xero_connections').update(patch).eq('org_id', g.a.orgId)
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })

  return NextResponse.json(await read({ ...g, prefs }))
}
