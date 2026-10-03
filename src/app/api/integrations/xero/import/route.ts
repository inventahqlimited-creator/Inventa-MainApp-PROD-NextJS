// src/app/api/integrations/xero/import/route.ts
// POST { entity, xeroIds: string[] } — bring chosen Xero-only contacts or products into Inventa. Admin only.
import { NextResponse } from 'next/server'
import { guardXero, parseEntity } from '@/lib/xero/guard'
import { importFromXero } from '@/lib/xero/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))
  const entity = parseEntity(body?.entity)
  if (!entity) return NextResponse.json({ error: 'Unknown entity.' }, { status: 400 })
  const xeroIds = Array.isArray(body?.xeroIds) ? (body.xeroIds as unknown[]).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : []
  if (xeroIds.length === 0) return NextResponse.json({ error: 'Pick at least one record to import.' }, { status: 400 })

  const r = await importFromXero(g.a.db, g.a.orgId, entity, xeroIds)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status === 429 ? 429 : 502 })
  return NextResponse.json({ imported: r.imported, linked: r.linked, failed: r.failed })
}
