// src/app/api/org/credit-notes/[id]/route.ts
// PATCH — edit an Open credit note (header and lines). Closed and cancelled ones are locked.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { buildLines } from '@/lib/credit-notes/server'
import type { CnLineInput } from '@/lib/credit-notes/config'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const g = await requirePerm('process_returns')
  if ('res' in g) return g.res
  const { orgId, db } = g.access
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const { data: cn } = await db.from('credit_notes').select('id, status, so_id, cn_number').eq('org_id', orgId).eq('id', id).maybeSingle()
  if (!cn) return NextResponse.json({ error: 'Credit note not found.' }, { status: 404 })
  const cur = cn as { status: string; so_id: string; cn_number: string }
  if (cur.status !== 'Open') return NextResponse.json({ error: `A ${cur.status.toLowerCase()} credit note can’t be edited.` }, { status: 409 })

  const locationId = typeof body.location_id === 'string' ? body.location_id : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!locationId) return NextResponse.json({ error: 'Choose the location the stock is returned to.' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'Enter the reason for the return.' }, { status: 400 })
  const { data: loc } = await db.from('locations').select('id, name').eq('org_id', orgId).eq('id', locationId).maybeSingle()
  if (!loc) return NextResponse.json({ error: 'That location wasn’t found.' }, { status: 400 })

  const built = await buildLines(db, orgId, cur.so_id, (body.lines ?? []) as CnLineInput[], locationId, id)
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: built.status })

  const returnDate = typeof body.return_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.return_date) ? body.return_date : undefined
  const { error } = await db.from('credit_notes').update({
    location_id: locationId, location_name: (loc as { name: string }).name, reason,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    total_amount: built.total, ...(returnDate ? { return_date: returnDate } : {}),
  }).eq('id', id).eq('org_id', orgId).eq('status', 'Open')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('credit_note_lines').delete().eq('cn_id', id)
  const { error: lerr } = await db.from('credit_note_lines').insert(built.rows.map(r => ({ ...r, org_id: orgId, cn_id: id })))
  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
