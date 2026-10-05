// src/app/api/integrations/xero/overview/route.ts
// GET ?entity=contact|product|invoice|bill|adjustment — counts and lists for the Xero dashboard.
import { NextResponse } from 'next/server'
import { guardXero, parseEntity } from '@/lib/xero/guard'
import { buildOverview } from '@/lib/xero/sync'
import { invoiceOverview } from '@/lib/xero/invoice'
import { billOverview } from '@/lib/xero/bill'
import { adjustmentOverview } from '@/lib/xero/adjustment'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const g = await guardXero(false)
  if ('res' in g) return g.res
  const raw = new URL(req.url).searchParams.get('entity')
  if (raw === 'invoice') return NextResponse.json(await invoiceOverview(g.a.db, g.a.orgId)) // from Inventa only, no call to Xero
  if (raw === 'bill') return NextResponse.json(await billOverview(g.a.db, g.a.orgId))
  if (raw === 'adjustment') return NextResponse.json(await adjustmentOverview(g.a.db, g.a.orgId, g.settings, g.prefs))
  const entity = parseEntity(raw)
  if (!entity) return NextResponse.json({ error: 'Unknown entity.' }, { status: 400 })

  const r = await buildOverview(g.a.db, g.a.orgId, entity)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status === 429 ? 429 : 502 })
  return NextResponse.json(r.overview)
}
