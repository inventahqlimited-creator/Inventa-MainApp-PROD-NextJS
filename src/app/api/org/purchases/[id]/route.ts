// src/app/api/org/purchases/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pickPO, lineRow, costLineRow } from '../shared'
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

export async function PATCH(request: Request, { params }: Params) {
  const permGate = await requireEditOrCancel(request, 'edit_purchases', 'cancel_purchases')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const ctx = await getOrg()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = ctx.adminClient
  const body = await request.json()

  // Make sure the PO belongs to this org
  const { data: existingPo } = await db.from('purchase_orders').select('id').eq('id', id).eq('org_id', ctx.org_id).single()
  if (!existingPo) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  // Can't cancel once stock has been received against the order
  if (typeof body.status === 'string' && body.status.toLowerCase() === 'cancelled') {
    const { data: received } = await db.from('purchase_order_lines').select('id').eq('po_id', id).gt('quantity_received', 0).limit(1)
    if (received && received.length > 0) {
      return NextResponse.json({ error: 'This order has stock received against it and can\'t be cancelled.' }, { status: 400 })
    }
  }

  // 1. Header fields (status changes, supplier, dates, totals…)
  const updates = pickPO(body)
  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('purchase_orders').update(updates).eq('id', id).eq('org_id', ctx.org_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2. Lines — only when the edit screen sends them. Update existing rows in place so
  //    received quantities / bin allocations are never lost; insert new; delete removed.
  if (Array.isArray(body.lines)) {
    const incoming = body.lines as Record<string, unknown>[]
    const { data: current, error: curErr } = await db
      .from('purchase_order_lines')
      .select('id, quantity_received, product_name')
      .eq('po_id', id)
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })

    const keepIds = new Set(incoming.map(l => l.id).filter(Boolean) as string[])
    const toDelete = (current ?? []).filter((c: { id: string }) => !keepIds.has(c.id))
    const blocked = toDelete.find((c: { quantity_received: number }) => Number(c.quantity_received) > 0)
    if (blocked) {
      return NextResponse.json({ error: `Can't remove "${blocked.product_name}" — some of it has already been received.` }, { status: 400 })
    }
    if (toDelete.length > 0) {
      const { error } = await db.from('purchase_order_lines').delete().in('id', toDelete.map((c: { id: string }) => c.id))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const currentIds = new Set((current ?? []).map((c: { id: string }) => c.id))
    for (let i = 0; i < incoming.length; i++) {
      const l = incoming[i]
      const row = lineRow(l, i)
      if (l.id && currentIds.has(l.id as string)) {
        const { error } = await db.from('purchase_order_lines').update(row).eq('id', l.id as string).eq('po_id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { error } = await db.from('purchase_order_lines').insert({ ...row, po_id: id, org_id: ctx.org_id })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // 3. Additional cost lines — simple replace
  if (Array.isArray(body.cost_lines)) {
    const { error: delErr } = await db.from('purchase_order_cost_lines').delete().eq('po_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    const cl = body.cost_lines as Record<string, unknown>[]
    if (cl.length > 0) {
      const { error } = await db
        .from('purchase_order_cost_lines')
        .insert(cl.map((l, i) => ({ ...costLineRow(l, i), po_id: id, org_id: ctx.org_id })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
