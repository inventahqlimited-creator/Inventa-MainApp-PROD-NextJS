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

const EDITABLE = ['draft', 'open', 'no stock', 'stock available', 'partial stock']

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = ctx.adminClient
  const body = await request.json()

  const { data: existing } = await db.from('sales_orders').select('id, status').eq('id', id).eq('org_id', ctx.org_id).single()
  if (!existing) return NextResponse.json({ error: 'Sales order not found' }, { status: 404 })
  const currentStatus = String((existing as { status: string }).status).toLowerCase()

  // Only Draft / Open orders can be changed or cancelled
  if (!EDITABLE.includes(currentStatus)) {
    return NextResponse.json({ error: `This order is ${(existing as { status: string }).status} and can't be changed.` }, { status: 400 })
  }
  // …and only if nothing has been picked yet
  const { data: picked } = await db.from('sales_order_lines').select('id').eq('so_id', id).gt('quantity_picked', 0).limit(1)
  if (picked && picked.length > 0) {
    return NextResponse.json({ error: 'Items on this order have already been picked, so it can\'t be changed or cancelled.' }, { status: 400 })
  }

  // Header
  const updates = pickSO(body)
  if (updates.status !== undefined && !['Draft', 'Open', 'Cancelled'].includes(String(updates.status))) delete updates.status
  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('sales_orders').update(updates).eq('id', id).eq('org_id', ctx.org_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Lines — update in place, insert new, delete removed
  if (Array.isArray(body.lines)) {
    const incoming = body.lines as Record<string, unknown>[]
    const { data: current, error: curErr } = await db.from('sales_order_lines').select('id').eq('so_id', id)
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })

    const keepIds = new Set(incoming.map(l => l.id).filter(Boolean) as string[])
    const toDelete = (current ?? []).filter((c: { id: string }) => !keepIds.has(c.id))
    if (toDelete.length > 0) {
      const { error } = await db.from('sales_order_lines').delete().in('id', toDelete.map((c: { id: string }) => c.id))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const currentIds = new Set((current ?? []).map((c: { id: string }) => c.id))
    for (let i = 0; i < incoming.length; i++) {
      const l = incoming[i]
      const row = lineRow(l, i)
      if (l.id && currentIds.has(l.id as string)) {
        const { error } = await db.from('sales_order_lines').update(row).eq('id', l.id as string).eq('so_id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { error } = await db.from('sales_order_lines').insert({ ...row, so_id: id, org_id: ctx.org_id })
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

  return NextResponse.json({ success: true })
}
