// POST { id } — post (or retry) one Closed credit note to Xero. Admin only, like the invoice route.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { postCreditNote } from '@/lib/xero/credit-note'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Invalid credit note.' }, { status: 400 })
  const r = await postCreditNote(g.a.db, g.a.orgId, id, g.settings, g.prefs)
  if (r.state !== 'posted') return NextResponse.json({ error: r.state === 'failed' ? r.error : r.reason }, { status: r.state === 'failed' && r.status && r.status < 500 ? r.status : 502 })
  return NextResponse.json({ number: r.number, url: r.url, warning: r.warning, status: r.status })
}
