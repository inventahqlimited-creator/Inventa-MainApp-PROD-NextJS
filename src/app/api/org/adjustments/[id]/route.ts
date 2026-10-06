import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cleanAdjustment, checkOwnership } from '@/lib/adjustments/validate'
import { getAccess, can, denyResponse } from '@/lib/auth/access'
import { requirePerm } from '@/lib/auth/access'

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
    .eq('org_id', orgId)
    .single()

  // `safe: true` means nothing has been written to stock yet, so the adjustment can go back to Draft.
  if (adjError || !adj) return { error: 'Adjustment not found', safe: true }
  const locationId = (adj as { location_id: string }).location_id

  const { data: lines, error: linesError } = await adminClient
    .from('adjustment_order_lines')
    .select('id, product_id, quantity_before, quantity_after, batch_number, serial_number, expiry_date, bin_id')
    .eq('adj_id', adjId)

  if (linesError) return { error: 'Could not read the adjustment lines', safe: true }

  const typedLines = (lines ?? []) as {
    id: string
    product_id: string
    quantity_before: number
    quantity_after: number
    batch_number: string | null
    serial_number: string | null
    expiry_date: string | null
    bin_id: string | null
  }[]

  // ── Validate serial uniqueness before applying any changes ──
  const incomingSerials = typedLines
    .map(l => l.serial_number)
    .filter((s): s is string => !!s)

  if (incomingSerials.length > 0) {
    // Check for duplicates within this adjustment itself
    const serialSet = new Set<string>()
    for (const s of incomingSerials) {
      if (serialSet.has(s)) {
        return { error: `Duplicate serial number in this adjustment: ${s}`, safe: true }
      }
      serialSet.add(s)
    }

    // Check for conflicts with existing stock groups in the org
    const { data: conflicts } = await adminClient
      .from('stock_groups')
      .select('serial_number')
      .eq('org_id', orgId)
      .in('serial_number', incomingSerials)

    if (conflicts && conflicts.length > 0) {
      const conflicted = conflicts.map((c: { serial_number: string }) => c.serial_number).join(', ')
      return { error: `Serial number already exists in stock: ${conflicted}`, safe: true }
    }
  }

  // The cost of each product at this moment (average, then last purchase, then cost price). It is saved on the line and the stock
  // movement so the value of the adjustment never changes later (this is what a Xero stock adjustment journal is based on).
  const productIds = [...new Set(typedLines.map(l => l.product_id).filter(Boolean))]
  const costOf = new Map<string, number | null>()
  if (productIds.length > 0) {
    const { data: prods } = await adminClient.from('products').select('id, avg_cost, last_cost, cost_price').eq('org_id', orgId).in('id', productIds)
    for (const p of (prods ?? []) as { id: string; avg_cost: number | null; last_cost: number | null; cost_price: number | null }[]) {
      costOf.set(p.id, [p.avg_cost, p.last_cost, p.cost_price].map(Number).find(x => Number.isFinite(x) && x > 0) ?? null)
    }
  }

  for (const line of typedLines) {
    if (!line.product_id) continue
    const delta = line.quantity_after - line.quantity_before
    const unitCost = costOf.get(line.product_id) ?? null
    if (unitCost !== null) await adminClient.from('adjustment_order_lines').update({ unit_cost: unitCost }).eq('id', line.id)

    // ── Update stock_levels (total per product+location) ──
    const { data: existing } = await adminClient
      .from('stock_levels')
      .select('id, quantity')
      .eq('org_id', orgId)
      .eq('product_id', line.product_id)
      .eq('location_id', locationId)
      .maybeSingle()

    if (existing) {
      const row = existing as { id: string; quantity: number }
      const { error: updateError } = await adminClient
        .from('stock_levels')
        .update({ quantity: row.quantity + delta, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('org_id', orgId)
      if (updateError) return { error: 'Could not update stock levels' }
    } else {
      const { error: insertError } = await adminClient
        .from('stock_levels')
        .insert({
          org_id: orgId,
          product_id: line.product_id,
          location_id: locationId,
          quantity: line.quantity_after,
        })
      if (insertError) return { error: 'Could not update stock levels' }
    }

    // ── Write to stock_movements ──
    if (delta !== 0) {
      const { error: mvtError } = await adminClient
        .from('stock_movements')
        .insert({
          org_id:         orgId,
          product_id:     line.product_id,
          location_id:    locationId,
          movement_type:  'adjustment',
          qty:            delta,
          unit_cost:      unitCost,
          reference_id:   adjId,
          reference_type: 'adjustment_order',
          bin_id:         line.bin_id         ?? null,
          serial_number:  line.serial_number  ?? null,
          batch_number:   line.batch_number   ?? null,
          expiry_date:    line.expiry_date     ?? null,
        })
      if (mvtError) return { error: 'Could not record the stock movement' }
    }

    // ── Upsert stock_groups (per lot: batch + serial + expiry + bin) ──
    // Find existing group matching this exact lot + bin combination
    const groupQuery = adminClient
      .from('stock_groups')
      .select('id, quantity')
      .eq('org_id', orgId)
      .eq('product_id', line.product_id)
      .eq('location_id', locationId)

    // Match nulls explicitly for each dimension
    const batchMatch  = line.batch_number  ?? null
    const serialMatch = line.serial_number ?? null
    const expiryMatch = line.expiry_date   ?? null
    const binMatch    = line.bin_id        ?? null

    const q  = batchMatch  ? groupQuery.eq('batch_number',  batchMatch)  : groupQuery.is('batch_number',  null)
    const q2 = serialMatch ? q.eq('serial_number', serialMatch)          : q.is('serial_number', null)
    const q3 = expiryMatch ? q2.eq('expiry_date',  expiryMatch)          : q2.is('expiry_date',  null)
    const q4 = binMatch    ? q3.eq('bin_id', binMatch)                   : q3.is('bin_id', null)

    const { data: existingGroup } = await q4.maybeSingle()

    if (existingGroup) {
      const g = existingGroup as { id: string; quantity: number }
      const newQty = g.quantity + delta
      if (newQty <= 0) {
        // Remove the group if quantity reaches zero
        await adminClient.from('stock_groups').delete().eq('id', g.id)
      } else {
        await adminClient
          .from('stock_groups')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', g.id)
      }
    } else if (line.quantity_after > 0) {
      await adminClient.from('stock_groups').insert({
        org_id:        orgId,
        product_id:    line.product_id,
        location_id:   locationId,
        batch_number:  line.batch_number  || null,
        serial_number: line.serial_number || null,
        expiry_date:   line.expiry_date   || null,
        bin_id:        line.bin_id        || null,
        quantity:      line.quantity_after,
      })
    }
  }

  return { error: null as string | null, safe: false }
}

// PATCH: update status (Complete or Cancel), or tick / untick "Don't send to Xero" ({ skip_xero })
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(user.id)
  if (!orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { status?: unknown; skip_xero?: unknown }

  // What they are doing decides which permission is needed.
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const needed = body.status === undefined && typeof body.skip_xero === 'boolean' ? 'xero_skip_adjustments'
    : body.status === 'Cancelled' ? 'cancel_adjustments'
    : 'create_adjustments' // completing an adjustment
  if (!can(access, needed)) return denyResponse()

  // "Don't send to Xero" can be changed until the adjustment has been posted
  if (body.status === undefined && typeof body.skip_xero === 'boolean') {
    const { data: rec } = await adminClient.from('xero_sync_records').select('status').eq('org_id', orgId).eq('entity', 'adjustment').eq('entity_id', id).maybeSingle()
    if ((rec as { status?: string } | null)?.status === 'synced') return NextResponse.json({ error: 'This adjustment has already been posted to Xero.' }, { status: 409 })
    const { error: skipError } = await adminClient.from('adjustment_orders').update({ skip_xero: body.skip_xero }).eq('id', id).eq('org_id', orgId)
    if (skipError) { console.error('skip_xero update failed', skipError.message); return NextResponse.json({ error: 'Could not update this adjustment' }, { status: 400 }) }
    return NextResponse.json({ ok: true })
  }

  if (body.status !== 'Completed' && body.status !== 'Cancelled') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Claim the adjustment in one step: only a Draft can be completed or cancelled, and only once.
  // This stops the same adjustment being applied to stock twice (double click, retry, or a replayed request).
  const { data: claimed, error } = await adminClient
    .from('adjustment_orders')
    .update({ status: body.status, ...(body.status === 'Completed' ? { completed_at: new Date().toISOString() } : {}) })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('status', 'Draft')
    .select('id')

  if (error) { console.error('adjustment status update failed', error.message); return NextResponse.json({ error: 'Could not update this adjustment' }, { status: 400 }) }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'This adjustment is no longer a draft, so it cannot be changed.' }, { status: 409 })
  }

  if (body.status === 'Completed') {
    const result = await applyStockChanges(adminClient, id, orgId)
    if (result.error) {
      console.error('adjustment stock update failed', id, result.error)
      if (result.safe) {
        // Nothing was applied: put it back to a draft so it can be fixed and retried.
        await adminClient.from('adjustment_orders').update({ status: 'Draft', completed_at: null }).eq('id', id).eq('org_id', orgId)
      }
      return NextResponse.json({ error: `Stock update failed: ${result.error}` }, { status: result.safe ? 400 : 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

// PUT: update draft adjustment details + lines
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permGate = await requirePerm('edit_adjustments')
  if ('res' in permGate) return permGate.res
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(user.id)
  if (!orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { id } = await params
  const cleaned = cleanAdjustment(await request.json().catch(() => null))
  if ('error' in cleaned && cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { header: adjData, lines } = cleaned as { header: Record<string, unknown>; lines?: Record<string, unknown>[] }
  const ownErr = await checkOwnership(adminClient, orgId, adjData, lines)
  if (ownErr) return NextResponse.json({ error: ownErr }, { status: 400 })

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

  if (headerError) { console.error('adjustment header update failed', headerError.message); return NextResponse.json({ error: 'Could not save the adjustment' }, { status: 400 }) }

  // Replace lines: delete existing, re-insert
  if (lines !== undefined) {
    const { error: deleteError } = await adminClient
      .from('adjustment_order_lines')
      .delete()
      .eq('adj_id', id)
      .eq('org_id', orgId)

    if (deleteError) { console.error('adjustment lines delete failed', deleteError.message); return NextResponse.json({ error: 'Could not save the adjustment lines' }, { status: 400 }) }

    if (lines.length > 0) {
      const lineRows = lines.map((l) => ({
        ...l,
        adj_id: id,
        org_id: orgId,
      }))
      const { error: insertError } = await adminClient
        .from('adjustment_order_lines')
        .insert(lineRows)

      if (insertError) { console.error('adjustment lines insert failed', insertError.message); return NextResponse.json({ error: 'Could not save the adjustment lines' }, { status: 400 }) }
    }
  }

  return NextResponse.json({ ok: true })
}
