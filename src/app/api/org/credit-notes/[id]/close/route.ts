// POST — close a credit note: stock goes back into the chosen location (close_credit_note, one transaction), then the
// credit note is posted to Xero when Xero is connected. A Xero failure never undoes the stock: the reply says so and it can be retried.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { postCreditNoteIfConnected } from '@/lib/xero/credit-note'
import { setActor } from '@/lib/xero/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const g = await requirePerm('process_returns')
  if ('res' in g) return g.res
  const { orgId, db, userId, name } = g.access
  const { id } = await params

  const { data, error } = await db.rpc('close_credit_note', { p_cn: id, p_org: orgId, p_user: userId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  setActor(db, { id: userId, name })
  const xero = await postCreditNoteIfConnected(db, orgId, id)
  return NextResponse.json({ ...(data as object ?? { new_status: 'Closed' }), xero })
}
