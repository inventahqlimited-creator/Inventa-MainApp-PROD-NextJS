import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
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
  const { lines, ...poData } = body

  // Insert PO
  const { data: po, error: poError } = await adminClient
    .from('purchase_orders')
    .insert({ ...poData, org_id: orgId })
    .select('id, po_number')
    .single()

  if (poError) return NextResponse.json({ error: poError.message }, { status: 500 })
  const poId = (po as { id: string; po_number: string }).id

  // Insert lines
  if (lines && lines.length > 0) {
    const lineRows = lines.map((l: Record<string, unknown>) => ({
      ...l,
      po_id: poId,
      org_id: orgId,
      total_cost: Number(l.quantity_ordered) * Number(l.unit_cost) * (1 - Number(l.discount) / 100),
    }))
    const { error: linesError } = await adminClient.from('purchase_order_lines').insert(lineRows)
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  return NextResponse.json({ id: poId })
}
