// src/app/api/integrations/xero/adjustment/route.ts
// POST { id } — post one completed stock adjustment to Xero as a manual journal.
// POST { all: true } — post up to 20 eligible, not-yet-posted adjustments; the reply says how many are left. Admin only.
// When Xero tracks inventory (Settings), nothing is sent: adjustments are posted in Xero by hand.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { accountsMapped, postAdjustment, postEligibleAdjustments } from '@/lib/xero/adjustment'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))

  if (body?.all === true) {
    if (g.prefs.inventory_tracked) return NextResponse.json({ error: 'Xero tracks your inventory, so stock adjustments are posted in Xero manually.' }, { status: 409 })
    if (!accountsMapped(g.settings)) return NextResponse.json({ error: 'Choose the inventory asset and stock adjustment accounts in Xero settings before posting stock adjustments.' }, { status: 409 })
    return NextResponse.json(await postEligibleAdjustments(g.a.db, g.a.orgId, g.settings, g.prefs))
  }

  const id = typeof body?.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Invalid adjustment.' }, { status: 400 })

  const r = await postAdjustment(g.a.db, g.a.orgId, id, g.settings, g.prefs)
  if (!r.ok) return NextResponse.json({ error: r.error, recorded: Boolean(r.recorded) }, { status: r.status === 404 ? 404 : r.status === 409 ? 409 : r.status === 429 ? 429 : r.status === 422 ? 422 : 502 })
  return NextResponse.json({ number: r.number, url: r.url, warning: r.warning, status: r.status })
}
