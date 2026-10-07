import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { cleanSignature } from '@/lib/email/library'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const { id } = await params
  const v = cleanSignature(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  if (v.value.is_default) await access.db.from('email_signatures').update({ is_default: false }).eq('org_id', access.orgId)
  const { data, error } = await access.db.from('email_signatures').update({ ...v.value, updated_at: new Date().toISOString() }).eq('id', id).eq('org_id', access.orgId).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const { id } = await params
  const { error } = await access.db.from('email_signatures').delete().eq('id', id).eq('org_id', access.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
