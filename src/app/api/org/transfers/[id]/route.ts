// src/app/api/org/transfers/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pickTR, lineRow, validateTransfer } from '../shared'
import { requireEditOrCancel } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

async function getOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  return m ? { org_id: (m as { org_id: string }).org_id, adminClient } : null
}

// Everything except Closed / Cancelled can still be edited
const EDITABLE = ['draft', 'open', 'picking', 'picked']
const FULFILLING = ['picking', 'picked']

type DbLine = { id: string; quantity: number; quantity_picked: number | null; product_id: string | null; from_bin_id: string | null }

export async function PATCH(request: Request, { params }: Params) {
  const permGate = await requireEditOrCancel(request, 'edit_transfers', 'cancel_transfers')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = ctx.adminClient
  const body = await request.json()

  const { data: existing } = await db
    .from('transfer_orders')
    .select('id, status, from_location_id, to_location_id')
    .eq('id', id).eq('org_id', ctx.org_id).single()
  if (!existing) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  const ex = existing as { status: string; from_location_id: string | null; to_location_id: string | null }
  const currentStatus = String(ex.status).toLowerCase()

  if (!EDITABLE.includes(currentStatus)) {
    return NextResponse.json({ error: `This transfer is ${ex.status} and can't be changed.` }, { status: 400 })
  }

  const { data: curLines, error: curErr } = await db
    .from('transfer_order_lines')
    .select('id, quantity, quantity_picked, product_id, from_bin_id')
    .eq('tr_id', id)
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
  const current = (curLines ?? []) as DbLine[]
  const byId = new Map(current.map(l => [l.id, l]))
  const anyPicked = current.some(l => Number(l.quantity_picked ?? 0) > 0)
  const fulfilling = FULFILLING.includes(currentStatus)

  // Header
  const updates = pickTR(body)
  if (updates.status !== undefined) {
    const s = String(updates.status)
    if (fulfilling) {
      // Picking / Picked is driven by the pick screen — only Cancelled is accepted here
      if (s !== 'Cancelled') delete updates.status
    } else if (!['Draft', 'Open', 'Cancelled'].includes(s)) {
      delete updates.status
    }
  }
  if (anyPicked && updates.from_location_id !== undefined && updates.from_location_id !== ex.from_location_id) {
    return NextResponse.json({ error: 'The From location can\'t change once items have been picked.' }, { status: 400 })
  }

  // Validate lines before writing anything
  if (Array.isArray(body.lines)) {
    const incoming = body.lines as Record<string, unknown>[]
    const keepIds = new Set(incoming.map(l => l.id).filter(Boolean) as string[])
    for (const c of current) {
      if (!keepIds.has(c.id) && Number(c.quantity_picked ?? 0) > 0) {
        return NextResponse.json({ error: 'A line that has been picked can\'t be removed. Un-pick it first.' }, { status: 400 })
      }
    }
    for (const l of incoming) {
      if (!(Number(l.quantity) > 0)) return NextResponse.json({ error: 'Every line needs a quantity above zero.' }, { status: 400 })
      const cur = l.id ? byId.get(l.id as string) : undefined
      if (!cur) continue
      const picked = Number(cur.quantity_picked ?? 0)
      const qty = Number(l.quantity)
      if (picked > 0 && Number.isFinite(qty) && qty < picked && !(picked >= Number(cur.quantity))) {
        return NextResponse.json({ error: `Quantity can't be lower than the ${picked} already picked.` }, { status: 400 })
      }
    }
    const fromId = (updates.from_location_id as string | undefined) ?? ex.from_location_id
    const toId = (updates.to_location_id as string | undefined) ?? ex.to_location_id
    const bad = await validateTransfer(db, ctx.org_id, fromId, toId, incoming)
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })
  }

  // Cancelling releases anything picked (stock hasn't moved yet, so these are just reservations)
  if (updates.status === 'Cancelled') {
    await db.from('transfer_order_picks').delete().eq('tr_id', id)
    await db.from('transfer_order_lines').update({ quantity_picked: 0 }).eq('tr_id', id)
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('transfer_orders').update(updates).eq('id', id).eq('org_id', ctx.org_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Lines — update in place, insert new, delete removed
  if (Array.isArray(body.lines)) {
    const incoming = body.lines as Record<string, unknown>[]
    const keepIds = new Set(incoming.map(l => l.id).filter(Boolean) as string[])
    const toDelete = current.filter(c => !keepIds.has(c.id))
    if (toDelete.length > 0) {
      const { error } = await db.from('transfer_order_lines').delete().in('id', toDelete.map(c => c.id))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (let i = 0; i < incoming.length; i++) {
      const l = incoming[i]
      const cur = l.id ? byId.get(l.id as string) : undefined
      if (cur) {
        const picked = Number(cur.quantity_picked ?? 0)
        const fullyPicked = picked > 0 && picked >= Number(cur.quantity)
        const full = lineRow(l, i)
        // Picked lines keep their product, From Bin (and quantity once fully picked); the To Bin can still change
        const patch = fullyPicked
          ? { sort_order: i, to_bin_id: full.to_bin_id }
          : picked > 0
            ? { quantity: full.quantity, to_bin_id: full.to_bin_id, sort_order: i }
            : full
        const { error } = await db.from('transfer_order_lines').update(patch).eq('id', cur.id).eq('tr_id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { error } = await db.from('transfer_order_lines').insert({ ...lineRow(l, i), tr_id: id, org_id: ctx.org_id })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // Re-check the status after an edit (e.g. a line was added to a fully picked transfer)
  if (fulfilling && updates.status !== 'Cancelled') {
    const { data: after } = await db
      .from('transfer_order_lines')
      .select('quantity, quantity_picked')
      .eq('tr_id', id)
    const rows = (after ?? []) as { quantity: number; quantity_picked: number | null }[]
    const rel = rows.filter(r => Number(r.quantity) > 0)
    const picked = rel.reduce((s, r) => s + Number(r.quantity_picked ?? 0), 0)
    const allPicked = rel.every(r => Number(r.quantity_picked ?? 0) >= Number(r.quantity))
    let next: string | null = null
    if (picked === 0) next = 'Open'
    else if (!allPicked) { if (currentStatus === 'picked') next = 'Picking' }
    else if (currentStatus === 'picking') next = 'Picked'
    if (next) await db.from('transfer_orders').update({ status: next }).eq('id', id).eq('org_id', ctx.org_id)
  }

  return NextResponse.json({ success: true })
}
