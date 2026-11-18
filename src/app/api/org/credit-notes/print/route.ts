// GET ?ids=a,b — what is needed to print credit notes (same page as the invoice, titled Credit Note).
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { loadCreditNotePayload } from '@/lib/credit-notes/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await requirePerm('view_sales')
  if ('res' in g) return g.res
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 100)
  if (!ids.length) return NextResponse.json({ error: 'No credit notes selected' }, { status: 400 })
  try {
    const payload = await loadCreditNotePayload(g.access.db, g.access.orgId, ids)
    if (!payload.orders.length) return NextResponse.json({ error: 'Cancelled credit notes can’t be printed.' }, { status: 404 })
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the credit note' }, { status: 500 })
  }
}
