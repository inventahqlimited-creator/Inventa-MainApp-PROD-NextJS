// src/app/api/org/credit-notes/route.ts
// POST — create a credit note (status Open) against a Closed sales order. Nothing moves until it is closed.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { buildLines, invoiceNumberFor, loadClosedOrder, loadSettings, nextCreditNoteNumber } from '@/lib/credit-notes/server'
import type { CnLineInput } from '@/lib/credit-notes/config'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const g = await requirePerm('process_returns')
  if ('res' in g) return g.res
  const { orgId, db, userId } = g.access
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const settings = await loadSettings(db, orgId)
  if (!settings.enabled) return NextResponse.json({ error: 'Credit notes are switched off in Settings → Sales → Credit Notes.' }, { status: 403 })

  const soId = typeof body.so_id === 'string' ? body.so_id : ''
  const locationId = typeof body.location_id === 'string' ? body.location_id : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(soId)) return NextResponse.json({ error: 'Choose the sales order.' }, { status: 400 })
  if (!locationId) return NextResponse.json({ error: 'Choose the location the stock is returned to.' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'Enter the reason for the return.' }, { status: 400 })

  const { data: loc } = await db.from('locations').select('id, name').eq('org_id', orgId).eq('id', locationId).maybeSingle()
  if (!loc) return NextResponse.json({ error: 'That location wasn’t found.' }, { status: 400 })

  const built = await buildLines(db, orgId, soId, (body.lines ?? []) as CnLineInput[], locationId)
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: built.status })
  const loaded = await loadClosedOrder(db, orgId, soId)
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const so = loaded.order

  const invoice = await invoiceNumberFor(db, orgId, soId)
  const returnDate = typeof body.return_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.return_date) ? body.return_date : new Date().toISOString().slice(0, 10)

  // The number is taken from what exists; if two people save at once the unique index refuses the second, so try again
  for (let attempt = 0; attempt < 4; attempt++) {
    const number = await nextCreditNoteNumber(db, orgId, settings)
    const { data: cn, error } = await db.from('credit_notes').insert({
      org_id: orgId, cn_number: number, so_id: soId, so_number: so.so_number, invoice_number: invoice,
      customer_id: so.customer_id, customer_name: so.customer_name, location_id: locationId, location_name: (loc as { name: string }).name,
      status: 'Open', return_date: returnDate, reason, notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      currency: so.currency, total_amount: built.total, created_by: userId,
    }).select('id').single()
    if (error) {
      if (error.code === '23505') continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const id = (cn as { id: string }).id
    const { error: lerr } = await db.from('credit_note_lines').insert(built.rows.map(r => ({ ...r, org_id: orgId, cn_id: id })))
    if (lerr) {
      await db.from('credit_notes').delete().eq('id', id)
      return NextResponse.json({ error: lerr.message }, { status: 500 })
    }
    await db.rpc('audit_write', { p_org: orgId, p_cat: 'Sales', p_action: 'Credit Note Created', p_ref: number, p_detail: `Credit note ${number} created against ${so.so_number ?? 'order'}`, p_etype: 'sales_orders', p_eid: soId })
    return NextResponse.json({ id, cn_number: number })
  }
  return NextResponse.json({ error: 'Could not allocate a credit note number. Please try again.' }, { status: 409 })
}
