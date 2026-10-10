import { NextResponse } from 'next/server'
import { requireAnyPerm, requirePerm } from '@/lib/auth/access'
import { cleanSignature } from '@/lib/email/library'

export async function GET() {
  const gate = await requireAnyPerm('manage_email_settings', 'send_emails')
  if ('res' in gate) return gate.res
  const { access } = gate
  const { data, error } = await access.db.from('email_signatures').select('*').eq('org_id', access.orgId).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: Request) {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const v = cleanSignature(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  if (v.value.is_default) await access.db.from('email_signatures').update({ is_default: false }).eq('org_id', access.orgId)
  const { data, error } = await access.db.from('email_signatures').insert({ ...v.value, org_id: access.orgId }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
