import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const body = await request.json()
  const { lines } = body as {
    lines: { id: string; qty_to_receive: number; batch_num: string | null; expiry_date: string | null; new_quantity_received: number }[]
    notes: string | null
  }

  // Update each line's quantity_received, batch_num, expiry_date
  for (const line of lines) {
    if (line.qty_to_receive <= 0) continue
    const { error } = await adminClient
      .from('purchase_order_lines')
      .update({
        quantity_received: line.new_quantity_received,
        batch_num: line.batch_num,
        expiry_date: line.expiry_date,
      })
      .eq('id', line.id)
      .eq('org_id', orgId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Determine new PO status
  const { data: allLines } = await adminClient
    .from('purchase_order_lines')
    .select('quantity_ordered, quantity_received')
    .eq('po_id', id)
    .eq('org_id', orgId)

  const allReceived = allLines?.every(l => (l.quantity_received ?? 0) >= l.quantity_ordered)
  const anyReceived = allLines?.some(l => (l.quantity_received ?? 0) > 0)

  const newStatus = allReceived ? 'Closed' : anyReceived ? 'Partially Received' : 'Open'

  // Update PO status
  await adminClient
    .from('purchase_orders')
    .update({ status: newStatus })
    .eq('id', id)
    .eq('org_id', orgId)

  // Apply stock movement
  if (newStatus === 'Closed' || newStatus === 'Partially Received') {
    const { error: fnError } = await adminClient.rpc('apply_po_receive', { p_po_id: id })
    if (fnError) console.error('apply_po_receive error:', fnError.message)
  }

  return NextResponse.json({ success: true, new_status: newStatus })
}
