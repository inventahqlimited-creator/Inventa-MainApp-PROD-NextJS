// src/app/api/org/sales/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pickSO, lineRow, costLineRow } from '../shared'

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
const EDITABLE = [
  'draft', 'open', 'no stock', 'stock available', 'partial stock',
  'picking', 'partially picked', 'picked', 'partially packed', 'packed',
]
const FULFILLING = ['picking', 'partially picked', 'picked', 'partially packed', 'packed']

type DbLine = { id: string; quantity: number; quantity_picked: number | null; product_id: string | null }

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = ctx.adminClient
  const body = await request.json()

  const { data: existing } = await db
    .from('sales_orders')
    .select('id, status, location_id')
    .eq('id', id).eq('org_id', ctx.org_id).single()
  if (!existing) return NextResponse.json({ error: 'Sales order not found' }, { status: 404 })
  const ex = existing as { status: string; location_id: string | null }
  const currentStatus = String(ex.status).toLowerCase()

  if (!EDITABLE.includes(currentStatus)) {
    return NextResponse.json({ error: `This order is ${ex.status} and can't be changed.` }, { status: 400 })
  }

  const { data: curLines, error: curErr } = await db
    .from('sales_order_lines')
    .select('id, quantity, quantity_picked, product_id')
    .eq('so_id', id)
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
  const current = (curLines ?? []) as DbLine[]
  const byId = new Map(current.map(l => [l.id, l]))
  const anyPicked = current.some(l => Number(l.quantity_picked ?? 0) > 0)
  const fulfilling = FULFILLING.includes(currentStatus)

  // Header
  const updates = pickSO(body)
  if (updates.status !== undefined) {
    const s = String(updates.status)
    if (fulfilling) {
      // Picking / Packed status is driven by the pick & pack screens — only Cancelled is accepted here
      if (s !== 'Cancelled') delete updates.status
    } else if (!['Draft', 'Open', 'Cancelled'].includes(s)) {
      delete updates.status
    }
  }
  if (updates.status === 'Cancelled' && anyPicked) {
    return NextResponse.json({ error: 'Items on this order have been picked. Un-pick them before cancelling.' }, { status: 400 })
  }
  if (anyPicked && updates.location_id !== undefined && updates.location_id !== ex.location_id) {
    return NextResponse.json({ error: 'The ship-from location can\'t change once items have been picked.' }, { status: 400 })
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
      const cur = l.id ? byId.get(l.id as string) : undefined
      if (!cur) continue
      const picked = Number(cur.quantity_picked ?? 0)
      const qty = Number(l.quantity)
      if (picked > 0 && Number.isFinite(qty) && qty < picked && !(picked >= Number(cur.quantity))) {
        return NextResponse.json({ error: `Quantity can't be lower than the ${picked} already picked.` }, { status: 400 })
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('sales_orders').update(updates).eq('id', id).eq('org_id', ctx.org_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Lines — update in place, insert new, delete removed
  if (Array.isArray(body.lines)) {
    const incoming = body.lines as Record<string, unknown>[]
    const keepIds = new Set(incoming.map(l => l.id).filter(Boolean) as string[])
    const toDelete = current.filter(c => !keepIds.has(c.id))
    if (toDelete.length > 0) {
      const { error } = await db.from('sales_order_lines').delete().in('id', toDelete.map(c => c.id))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (let i = 0; i < incoming.length; i++) {
      const l = incoming[i]
      const cur = l.id ? byId.get(l.id as string) : undefined
      if (cur) {
        const picked = Number(cur.quantity_picked ?? 0)
        const fullyPicked = picked > 0 && picked >= Number(cur.quantity)
        // Fully picked lines are locked — only their position can change
        const patch = fullyPicked ? { sort_order: i } : lineRow(l, i)
        const { error } = await db.from('sales_order_lines').update(patch).eq('id', cur.id).eq('so_id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { error } = await db.from('sales_order_lines').insert({ ...lineRow(l, i), so_id: id, org_id: ctx.org_id })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // Additional charges — simple replace
  if (Array.isArray(body.cost_lines)) {
    const { error: delErr } = await db.from('sales_order_cost_lines').delete().eq('so_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    const cl = body.cost_lines as Record<string, unknown>[]
    if (cl.length > 0) {
      const { error } = await db
        .from('sales_order_cost_lines')
        .insert(cl.map((l, i) => ({ ...costLineRow(l, i), so_id: id, org_id: ctx.org_id })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Re-check fulfilment status after the edit
  if (fulfilling && updates.status !== 'Cancelled') {
    const { data: after } = await db
      .from('sales_order_lines')
      .select('quantity, quantity_picked, product_id')
      .eq('so_id', id)
    const rows = (after ?? []) as { quantity: number; quantity_picked: number | null; product_id: string | null }[]
    const pids = Array.from(new Set(rows.map(r => r.product_id).filter(Boolean) as string[]))
    const { data: prods } = pids.length
      ? await db.from('products').select('id, track_stock, type').in('id', pids)
      : { data: [] as { id: string; track_stock: boolean | null; type: string | null }[] }
    const stocked = new Set(
      ((prods ?? []) as { id: string; track_stock: boolean | null; type: string | null }[])
        .filter(p => (p.track_stock ?? true) && p.type !== 'Service').map(p => p.id),
    )
    const rel = rows.filter(r => r.product_id && stocked.has(r.product_id) && Number(r.quantity) > 0)
    const picked = rel.reduce((s, r) => s + Number(r.quantity_picked ?? 0), 0)
    const allPicked = rel.every(r => Number(r.quantity_picked ?? 0) >= Number(r.quantity))
    let next: string | null = null
    if (picked === 0) next = 'Open'
    else if (currentStatus === 'packed' && !allPicked) next = 'Picking'
    if (next) await db.from('sales_orders').update({ status: next }).eq('id', id).eq('org_id', ctx.org_id)
  }

  return NextResponse.json({ success: true })
}
