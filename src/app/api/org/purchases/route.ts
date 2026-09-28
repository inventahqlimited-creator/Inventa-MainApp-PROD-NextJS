// src/app/api/org/purchases/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pickPO, lineRow, costLineRow, nextPoNumber } from './shared'

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
  const lines: Record<string, unknown>[] = Array.isArray(body.lines) ? body.lines : []
  const costLines: Record<string, unknown>[] = Array.isArray(body.cost_lines) ? body.cost_lines : []
  if (lines.length === 0) return NextResponse.json({ error: 'Add at least one line item.' }, { status: 400 })

  // Only known purchase_orders columns go into the insert (lines/cost_lines live in their own tables)
  const poData = pickPO(body)

  // Assign PO number from org settings (prefix / digits / suffix / start)
  let poNumber: string
  try {
    poNumber = await nextPoNumber(adminClient, orgId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const { data: po, error: poError } = await adminClient
    .from('purchase_orders')
    .insert({ ...poData, po_number: poNumber, org_id: orgId, created_by: user.id })
    .select('id, po_number')
    .single()

  if (poError) return NextResponse.json({ error: poError.message }, { status: 500 })
  const poId = (po as { id: string; po_number: string }).id

  // Lines
  const { error: linesError } = await adminClient
    .from('purchase_order_lines')
    .insert(lines.map((l, i) => ({ ...lineRow(l, i), po_id: poId, org_id: orgId })))
  if (linesError) {
    await adminClient.from('purchase_orders').delete().eq('id', poId) // don't leave a half-saved PO behind
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  // Additional cost lines
  if (costLines.length > 0) {
    const { error: costError } = await adminClient
      .from('purchase_order_cost_lines')
      .insert(costLines.map((l, i) => ({ ...costLineRow(l, i), po_id: poId, org_id: orgId })))
    if (costError) {
      await adminClient.from('purchase_orders').delete().eq('id', poId)
      return NextResponse.json({ error: costError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: poId, po_number: (po as { po_number: string }).po_number })
}
