// src/app/api/integrations/xero/run/route.ts
// POST { scope?: 'full' | …, skip?: ('contacts'|'products'|'invoices'|'bills')[] } — "Sync now". Admin only.
// Posts what isn't in Xero yet, within about 50 seconds. If `done` is false, call again with the finished parts in `skip`.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { runScope, type Part } from '@/lib/xero/run'
import { normalizePrefs } from '@/lib/xero/prefs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PARTS: Part[] = ['contacts', 'products', 'invoices', 'bills']

export async function POST(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))
  const scope = normalizePrefs({ scope: body?.scope }).scope
  const skip = Array.isArray(body?.skip) ? (body.skip as unknown[]).filter((p): p is Part => PARTS.includes(p as Part)) : []
  return NextResponse.json(await runScope(g.a.db, g.a.orgId, scope, g.settings, g.prefs, { skip }))
}
