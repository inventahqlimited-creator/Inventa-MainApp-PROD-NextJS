// src/app/api/integrations/xero/sync/route.ts
// POST { entity: 'contact' | 'product', id?: string }
// Sends one record (id) or everything not yet synced to Xero. Admin only.
import { NextResponse } from 'next/server'
import { guardXero, parseEntity } from '@/lib/xero/guard'
import { runSync } from '@/lib/xero/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))
  const entity = parseEntity(body?.entity)
  if (!entity) return NextResponse.json({ error: 'Unknown entity.' }, { status: 400 })
  const id = typeof body?.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  if (body?.id && !id) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })

  const r = await runSync(g.a.db, g.a.orgId, entity, { ids: id ? [id] : undefined, settings: g.settings })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status === 429 ? 429 : r.status === 409 ? 409 : 502 })
  return NextResponse.json(r.summary)
}
