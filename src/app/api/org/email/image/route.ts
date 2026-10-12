// src/app/api/org/email/image/route.ts
// Uploads a picture for an email signature or template and returns its public address.
// Stored in the public "org-assets" bucket (same one as the company logo). PNG, JPG or GIF, 1 MB at most.
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAnyPerm } from '@/lib/auth/access'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }

export async function POST(req: Request) {
  const g = await requireAnyPerm('manage_email_settings', 'send_emails')
  if ('res' in g) return g.res
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Only PNG, JPG or GIF pictures can be used in emails.' }, { status: 400 })
  if (file.size > 1024 * 1024) return NextResponse.json({ error: 'The picture must be under 1 MB.' }, { status: 400 })

  const path = `email-images/${g.access.orgId}/${randomUUID()}.${ext}`
  const { error } = await g.access.db.storage.from('org-assets').upload(path, await file.arrayBuffer(), { contentType: file.type })
  if (error) return NextResponse.json({ error: 'Could not upload the picture.' }, { status: 500 })
  const { data } = g.access.db.storage.from('org-assets').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
