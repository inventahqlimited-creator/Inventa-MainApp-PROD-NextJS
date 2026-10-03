// src/app/api/integrations/xero/overview/route.ts
// GET ?entity=contact|product — counts and lists for the Xero dashboard.
import { NextResponse } from 'next/server'
import { guardXero, parseEntity } from '@/lib/xero/guard'
import { buildOverview } from '@/lib/xero/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const g = await guardXero(false)
  if ('res' in g) return g.res
  const entity = parseEntity(new URL(req.url).searchParams.get('entity'))
  if (!entity) return NextResponse.json({ error: 'Unknown entity.' }, { status: 400 })

  const r = await buildOverview(g.a.db, g.a.orgId, entity)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status === 429 ? 429 : 502 })
  return NextResponse.json(r.overview)
}
