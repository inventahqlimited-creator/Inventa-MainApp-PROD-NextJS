// src/app/api/org/attachments/[attId]/file/route.ts
// GET — open an attachment. Checks the person may see that kind of order, then sends them to a short-lived link to the file.
import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import type { PermKey } from '@/lib/permissions'

const VIEW: Record<string, PermKey> = { sales: 'view_sales', purchases: 'view_purchases', transfers: 'view_transfers' }

export async function GET(_req: Request, { params }: { params: Promise<{ attId: string }> }) {
  const { attId } = await params
  const a = await getAccess()
  if (!a) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(attId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { data } = await a.db.from('order_attachments').select('entity_type, storage_path, file_name').eq('id', attId).eq('org_id', a.orgId).maybeSingle()
  const att = data as { entity_type: string; storage_path: string; file_name: string } | null
  if (!att) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
  if (!a.perms[VIEW[att.entity_type]]) return NextResponse.json({ error: 'You don’t have permission to view this attachment.' }, { status: 403 })
  const { data: signed, error } = await a.db.storage.from('order-attachments').createSignedUrl(att.storage_path, 120)
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'We couldn’t open that file just now.' }, { status: 500 })
  const res = NextResponse.redirect(signed.signedUrl)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
