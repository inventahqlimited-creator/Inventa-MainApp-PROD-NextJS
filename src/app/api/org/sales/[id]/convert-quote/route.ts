// src/app/api/org/sales/[id]/convert-quote/route.ts
// Turn a quote into a sales order.
//   mode "convert" → the quote itself becomes an Open sales order (same number)
//   mode "copy"    → the quote stays as it is and a new Open sales order (new number) is created from it
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { lineRow, costLineRow, nextSoNumber } from '../../shared'

type Params = { params: Promise<{ id: string }> }

const COPY_FIELDS = [
  'customer_id', 'customer_name', 'location_id', 'location_name', 'expected_date', 'ref', 'terms', 'currency',
  'total_amount', 'order_discount', 'order_discount_type', 'order_discount_amount', 'price_level_id', 'price_level_name',
] as const

function today(tz: string): { iso: string; label: string } {
  const now = new Date()
  let zone = tz
  try { new Intl.DateTimeFormat('en-NZ', { timeZone: zone }) } catch { zone = 'Pacific/Auckland' }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const label = new Intl.DateTimeFormat('en-NZ', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' }).format(now)
  return { iso: parts, label }
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'copy' ? 'copy' : body.mode === 'convert' ? 'convert' : null
  if (!mode) return NextResponse.json({ error: 'Choose whether to keep the quote or convert it.' }, { status: 400 })

  const { data: quote } = await db
    .from('sales_orders')
    .select('*')
    .eq('id', id).eq('org_id', orgId).single()
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = quote as any
  if (String(q.status).toLowerCase() !== 'quote') {
    return NextResponse.json({ error: 'This order is no longer a quote.' }, { status: 400 })
  }

  const { data: org } = await db.from('organisations').select('timezone').eq('id', orgId).single()
  const when = today(String((org as { timezone?: string | null } | null)?.timezone ?? 'Pacific/Auckland'))

  const { data: lineRows } = await db.from('sales_order_lines').select('*').eq('so_id', id)
  const lines = (lineRows ?? []) as Record<string, unknown>[]
  if (lines.length === 0) return NextResponse.json({ error: 'This quote has no line items.' }, { status: 400 })
  const sort = (a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)

  if (mode === 'convert') {
    const note = `Converted from quote on ${when.label}`
    const notes = q.notes ? `${note}\n${q.notes}` : note
    const { error } = await db
      .from('sales_orders')
      .update({ status: 'Open', notes, order_date: when.iso })
      .eq('id', id).eq('org_id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id, so_number: q.so_number })
  }

  // copy: new order, new number
  const { data: costRows } = await db.from('sales_order_cost_lines').select('*').eq('so_id', id)
  const costLines = (costRows ?? []) as Record<string, unknown>[]

  const soData: Record<string, unknown> = {}
  for (const k of COPY_FIELDS) if (q[k] !== undefined) soData[k] = q[k]
  const note = `Created from quote ${q.so_number ?? ''}`.trim()
  soData.notes = q.notes ? `${note}\n${q.notes}` : note
  soData.status = 'Open'
  soData.order_date = when.iso

  let created: { id: string; so_number: string } | null = null
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    let soNumber: string
    try { soNumber = await nextSoNumber(db, orgId) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
    const { data, error } = await db
      .from('sales_orders')
      .insert({ ...soData, so_number: soNumber, org_id: orgId, created_by: user.id })
      .select('id, so_number')
      .single()
    if (error) {
      if (error.code === '23505') continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    created = data as { id: string; so_number: string }
  }
  if (!created) return NextResponse.json({ error: 'Could not assign an order number — please try again.' }, { status: 500 })

  const { error: linesError } = await db
    .from('sales_order_lines')
    .insert([...lines].sort(sort).map((l, i) => ({ ...lineRow(l, i), so_id: created!.id, org_id: orgId })))
  if (linesError) {
    await db.from('sales_orders').delete().eq('id', created.id)
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }
  if (costLines.length > 0) {
    const { error: costError } = await db
      .from('sales_order_cost_lines')
      .insert([...costLines].sort(sort).map((l, i) => ({ ...costLineRow(l, i), so_id: created!.id, org_id: orgId })))
    if (costError) {
      await db.from('sales_orders').delete().eq('id', created.id)
      return NextResponse.json({ error: costError.message }, { status: 500 })
    }
  }
  return NextResponse.json({ id: created.id, so_number: created.so_number })
}
