// src/app/api/org/attachments/[attId]/route.ts
// DELETE — remove an attachment (the file and its record).
import { NextResponse } from 'next/server'
import { requireAnyPerm } from '@/lib/auth/access'
import type { PermKey } from '@/lib/permissions'

const CFG: Record<string, { table: string; number: string; category: string; entity: string; write: PermKey[] }> = {
  sales: { table: 'sales_orders', number: 'so_number', category: 'Sales', entity: 'sales_orders', write: ['create_sales', 'edit_sales'] },
  purchases: { table: 'purchase_orders', number: 'po_number', category: 'Purchases', entity: 'purchase_orders', write: ['create_purchases', 'edit_purchases'] },
  transfers: { table: 'transfer_orders', number: 'tr_number', category: 'Transfers', entity: 'transfer_orders', write: ['create_transfers', 'edit_transfers'] },
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ attId: string }> }) {
  const { attId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(attId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await requireAnyPerm('create_sales', 'edit_sales', 'create_purchases', 'edit_purchases', 'create_transfers', 'edit_transfers')
  if ('res' in g) return g.res
  const { db, orgId, userId, name, perms } = g.access
  const { data: a } = await db.from('order_attachments').select('id, entity_type, entity_id, file_name, storage_path').eq('id', attId).eq('org_id', orgId).maybeSingle()
  const att = a as { id: string; entity_type: string; entity_id: string; file_name: string; storage_path: string } | null
  if (!att) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
  const c = CFG[att.entity_type]
  if (!c || !c.write.some(k => perms[k])) return NextResponse.json({ error: 'You don’t have permission to remove attachments on this kind of order.' }, { status: 403 })

  await db.storage.from('order-attachments').remove([att.storage_path])
  const { error } = await db.from('order_attachments').delete().eq('id', attId).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: 'We couldn’t remove that attachment. Please try again.' }, { status: 500 })
  const { data: order } = await db.from(c.table).select(c.number).eq('id', att.entity_id).eq('org_id', orgId).maybeSingle()
  await db.from('audit_log').insert({
    org_id: orgId, category: c.category, action: 'Attachment Removed', ref: order ? (order as unknown as Record<string, string | null>)[c.number] : null,
    detail: att.file_name, entity_type: c.entity, entity_id: att.entity_id, user_id: userId, user_name: name,
  })
  return NextResponse.json({ ok: true })
}
