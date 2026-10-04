// src/app/api/integrations/xero/invoice/route.ts
// POST { id } — post one Closed sales order to Xero as an invoice.
// POST { all: true } — post up to 20 Closed, not-yet-posted orders; the reply says how many are left. Admin only.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { postEligibleInvoices, postInvoice } from '@/lib/xero/invoice'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))

  if (body?.all === true) {
    if (!g.settings.sales_account_code || !g.settings.purchases_account_code) {
      return NextResponse.json({ error: 'Save the Accounts and tax settings in Xero settings before posting invoices.' }, { status: 409 })
    }
    return NextResponse.json(await postEligibleInvoices(g.a.db, g.a.orgId, g.settings, g.prefs))
  }

  const id = typeof body?.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })

  const r = await postInvoice(g.a.db, g.a.orgId, id, g.settings, g.prefs)
  if (!r.ok) return NextResponse.json({ error: r.error, recorded: Boolean(r.recorded) }, { status: r.status === 404 ? 404 : r.status === 409 ? 409 : r.status === 429 ? 429 : r.status === 422 ? 422 : 502 })
  return NextResponse.json({ number: r.number, url: r.url, warning: r.warning, status: r.status })
}
