import { NextRequest, NextResponse } from 'next/server'
import { withOrg } from '@/lib/api/with-org'

export const GET = withOrg(async (req: NextRequest, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!
  const { data, error } = await ctx.adminClient
    .from('adjustment_orders')
    .select('*, adjustment_order_lines(*)')
    .eq('id', id)
    .eq('org_id', ctx.org_id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
})

export const PATCH = withOrg(async (req: NextRequest, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!
  const body = await req.json()

  // Update the adjustment order status
  const { error } = await ctx.adminClient
    .from('adjustment_orders')
    .update({ status: body.status })
    .eq('id', id)
    .eq('org_id', ctx.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // If completing, apply stock level changes
  if (body.status === 'Completed') {
    // Get all lines for this adjustment
    const { data: lines, error: linesError } = await ctx.adminClient
      .from('adjustment_order_lines')
      .select('product_id, quantity_before, quantity_after')
      .eq('adjustment_order_id', id)

    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 400 })

    // Get the location for this adjustment
    const { data: adj, error: adjError } = await ctx.adminClient
      .from('adjustment_orders')
      .select('location_id')
      .eq('id', id)
      .single()

    if (adjError) return NextResponse.json({ error: adjError.message }, { status: 400 })

    const locationId = adj.location_id

    // Upsert stock levels for each line
    for (const line of (lines ?? [])) {
      if (!line.product_id) continue
      const delta = line.quantity_after - line.quantity_before

      // Try to update existing stock level row first
      const { data: existing } = await ctx.adminClient
        .from('stock_levels')
        .select('id, quantity')
        .eq('product_id', line.product_id)
        .eq('location_id', locationId)
        .maybeSingle()

      if (existing) {
        await ctx.adminClient
          .from('stock_levels')
          .update({ quantity: existing.quantity + delta })
          .eq('id', existing.id)
      } else {
        await ctx.adminClient
          .from('stock_levels')
          .insert({ product_id: line.product_id, location_id: locationId, org_id: ctx.org_id, quantity: line.quantity_after })
      }
    }
  }

  return NextResponse.json({ ok: true })
})

export const DELETE = withOrg(async (req: NextRequest, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!
  const { error } = await ctx.adminClient
    .from('adjustment_orders')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
})
