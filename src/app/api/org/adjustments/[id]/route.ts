import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getOrgId(userId: string) {
  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .eq('invite_status', 'accepted')
    .single()
  return m ? (m as { org_id: string }).org_id : null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(user.id)
  if (!orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { id } = await params
  const body = await request.json()

  // Update the adjustment order status
  const { error } = await adminClient
    .from('adjustment_orders')
    .update({ status: body.status })
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // If completing, apply stock level changes
  if (body.status === 'Completed') {
    // Get the location and lines for this adjustment
    const { data: adj, error: adjError } = await adminClient
      .from('adjustment_orders')
      .select('location_id')
      .eq('id', id)
      .single()

    if (adjError) return NextResponse.json({ error: adjError.message }, { status: 400 })

    const { data: lines, error: linesError } = await adminClient
      .from('adjustment_order_lines')
      .select('product_id, quantity_before, quantity_after')
      .eq('adj_id', id)

    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 400 })

    const locationId = (adj as { location_id: string }).location_id

    // Upsert stock levels for each line
    for (const line of (lines ?? []) as { product_id: string; quantity_before: number; quantity_after: number }[]) {
      if (!line.product_id) continue
      const delta = line.quantity_after - line.quantity_before

      const { data: existing } = await adminClient
        .from('stock_levels')
        .select('id, quantity')
        .eq('product_id', line.product_id)
        .eq('location_id', locationId)
        .maybeSingle()

      if (existing) {
        await adminClient
          .from('stock_levels')
          .update({ quantity: (existing as { id: string; quantity: number }).quantity + delta })
          .eq('id', (existing as { id: string; quantity: number }).id)
      } else {
        await adminClient
          .from('stock_levels')
          .insert({
            product_id: line.product_id,
            location_id: locationId,
            org_id: orgId,
            quantity: line.quantity_after,
          })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
