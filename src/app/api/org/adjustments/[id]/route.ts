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
    const { data: adj } = await adminClient
      .from('adjustment_orders')
      .select('location_id')
      .eq('id', id)
      .single()

    if (!adj) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
    const locationId = (adj as { location_id: string }).location_id

    const { data: lines } = await adminClient
      .from('adjustment_order_lines')
      .select('product_id, quantity_before, quantity_after')
      .eq('adj_id', id)

    for (const line of (lines ?? []) as { product_id: string; quantity_before: number; quantity_after: number }[]) {
      if (!line.product_id) continue
      const delta = line.quantity_after - line.quantity_before

      // Check if a stock_levels row already exists (admin client bypasses RLS)
      const { data: existing } = await adminClient
        .from('stock_levels')
        .select('id, quantity')
        .eq('product_id', line.product_id)
        .eq('location_id', locationId)
        .maybeSingle()

      if (existing) {
        const row = existing as { id: string; quantity: number }
        await adminClient
          .from('stock_levels')
          .update({ quantity: row.quantity + delta, updated_at: new Date().toISOString() })
          .eq('id', row.id)
      } else {
        // Insert — if unique constraint fires it means a race condition; ignore
        await adminClient
          .from('stock_levels')
          .insert({
            org_id: orgId,
            product_id: line.product_id,
            location_id: locationId,
            quantity: line.quantity_after,
          })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
