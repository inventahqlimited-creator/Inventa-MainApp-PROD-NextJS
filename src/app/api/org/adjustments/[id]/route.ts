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

async function applyStockChanges(adminClient: ReturnType<typeof createAdminClient>, adjId: string, orgId: string) {
  const { data: adj, error: adjError } = await adminClient
    .from('adjustment_orders')
    .select('location_id')
    .eq('id', adjId)
    .single()

  if (adjError || !adj) return { error: adjError?.message ?? 'Adjustment not found' }
  const locationId = (adj as { location_id: string }).location_id

  const { data: lines, error: linesError } = await adminClient
    .from('adjustment_order_lines')
    .select('product_id, quantity_before, quantity_after')
    .eq('adj_id', adjId)

  if (linesError) return { error: linesError.message }

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
      const row = existing as { id: string; quantity: number }
      const { error: updateError } = await adminClient
        .from('stock_levels')
        .update({ quantity: row.quantity + delta, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (updateError) return { error: updateError.message }
    } else {
      const { error: insertError } = await adminClient
        .from('stock_levels')
        .insert({
          org_id: orgId,
          product_id: line.product_id,
          location_id: locationId,
          quantity: line.quantity_after,
        })
      if (insertError) return { error: insertError.message }
    }
  }

  return { error: null }
}

// PATCH: update status (Complete or Cancel)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(user.id)
  if (!orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { id } = await params
  const body = await request.json()

  const { error } = await adminClient
    .from('adjustment_orders')
    .update({ status: body.status })
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (body.status === 'Completed') {
    const { error: stockError } = await applyStockChanges(adminClient, id, orgId)
    if (stockError) return NextResponse.json({ error: `Stock update failed: ${stockError}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PUT: update draft adjustment details + lines
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(user.id)
  if (!orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { id } = await params
  const body = await request.json()
  const { lines, ...adjData } = body

  // Only allow editing drafts
  const { data: existing } = await adminClient
    .from('adjustment_orders')
    .select('status')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((existing as { status: string }).status !== 'Draft') {
    return NextResponse.json({ error: 'Only draft adjustments can be edited' }, { status: 400 })
  }

  // Update header
  const { error: headerError } = await adminClient
    .from('adjustment_orders')
    .update(adjData)
    .eq('id', id)
    .eq('org_id', orgId)

  if (headerError) return NextResponse.json({ error: headerError.message }, { status: 400 })

  // Replace lines: delete existing, re-insert
  if (lines !== undefined) {
    const { error: deleteError } = await adminClient
      .from('adjustment_order_lines')
      .delete()
      .eq('adj_id', id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

    if (lines.length > 0) {
      const lineRows = lines.map((l: Record<string, unknown>, i: number) => ({
        ...l,
        adj_id: id,
        org_id: orgId,
        sort_order: i,
      }))
      const { error: insertError } = await adminClient
        .from('adjustment_order_lines')
        .insert(lineRows)

      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
