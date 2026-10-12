// src/app/api/org/attachments/route.ts
// GET ?type=sales|purchases|transfers&id=… lists an order's attachments; POST (multipart: type, id, file) adds one.
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAnyPerm } from '@/lib/auth/access'
import type { PermKey } from '@/lib/permissions'
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS_PER_ORDER, attachmentProblem, cleanFileName, extOf, type AttachmentEntity } from '@/lib/attachments'

const CFG: Record<AttachmentEntity, { table: string; number: string; category: string; entity: string; view: PermKey; write: PermKey[] }> = {
  sales: { table: 'sales_orders', number: 'so_number', category: 'Sales', entity: 'sales_orders', view: 'view_sales', write: ['create_sales', 'edit_sales'] },
  purchases: { table: 'purchase_orders', number: 'po_number', category: 'Purchases', entity: 'purchase_orders', view: 'view_purchases', write: ['create_purchases', 'edit_purchases'] },
  transfers: { table: 'transfer_orders', number: 'tr_number', category: 'Transfers', entity: 'transfer_orders', view: 'view_transfers', write: ['create_transfers', 'edit_transfers'] },
}
const isType = (t: unknown): t is AttachmentEntity => t === 'sales' || t === 'purchases' || t === 'transfers'
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function GET(req: Request) {
  const u = new URL(req.url)
  const type = u.searchParams.get('type'), id = u.searchParams.get('id')
  if (!isType(type) || !isId(id)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await requireAnyPerm(CFG[type].view)
  if ('res' in g) return g.res
  const { db, orgId } = g.access
  const { data, error } = await db.from('order_attachments')
    .select('id, file_name, content_type, size_bytes, uploaded_by_name, created_at')
    .eq('org_id', orgId).eq('entity_type', type).eq('entity_id', id).order('created_at')
  if (error) return NextResponse.json({ error: 'Attachments aren’t set up yet — run the Release G SQL.' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const type = form?.get('type'), id = form?.get('id'), file = form?.get('file')
  if (!isType(type) || !isId(id) || !(file instanceof File)) return NextResponse.json({ error: 'Choose a file to attach.' }, { status: 400 })
  const c = CFG[type]
  const g = await requireAnyPerm(...c.write)
  if ('res' in g) return g.res
  const { db, orgId, userId, name } = g.access

  const problem = attachmentProblem(file)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data: order } = await db.from(c.table).select(`id, ${c.number}`).eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  const { count } = await db.from('order_attachments').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('entity_type', type).eq('entity_id', id)
  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_ORDER) return NextResponse.json({ error: `An order can have up to ${MAX_ATTACHMENTS_PER_ORDER} attachments. Remove one first.` }, { status: 400 })

  const fileName = cleanFileName(file.name)
  const ext = extOf(fileName)
  const contentType = ATTACHMENT_TYPES[ext]
  const path = `${orgId}/${type}/${id}/${randomUUID()}.${ext}`
  const { error: upErr } = await db.storage.from('order-attachments').upload(path, await file.arrayBuffer(), { contentType })
  if (upErr) return NextResponse.json({ error: 'We couldn’t upload that file just now. Please try again.' }, { status: 500 })

  const { data: row, error } = await db.from('order_attachments').insert({
    org_id: orgId, entity_type: type, entity_id: id, file_name: fileName, content_type: contentType, size_bytes: file.size,
    storage_path: path, uploaded_by: userId, uploaded_by_name: name,
  }).select('id, file_name, content_type, size_bytes, uploaded_by_name, created_at').single()
  if (error || !row) {
    await db.storage.from('order-attachments').remove([path])
    return NextResponse.json({ error: 'We couldn’t save that attachment. Please try again.' }, { status: 500 })
  }
  await db.from('audit_log').insert({
    org_id: orgId, category: c.category, action: 'Attachment Added', ref: (order as unknown as Record<string, string | null>)[c.number],
    detail: fileName, entity_type: c.entity, entity_id: id, user_id: userId, user_name: name,
  })
  return NextResponse.json(row)
}
