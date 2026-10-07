import { NextResponse } from 'next/server'
import { requireAnyPerm, requirePerm } from '@/lib/auth/access'
import { effectiveFrom, readSettings, validateSettingsInput } from '@/lib/email/config'
import { emailConfigured } from '@/lib/email/resend'

export async function GET() {
  const gate = await requireAnyPerm('manage_email_settings', 'send_emails')
  if ('res' in gate) return gate.res
  const { access } = gate
  const { data: org } = await access.db.from('organisations').select('name, trading_name, email_settings').eq('id', access.orgId).single()
  const s = readSettings(org?.email_settings)
  const from = effectiveFrom(s, org?.trading_name || org?.name || '')
  return NextResponse.json({ settings: s, configured: emailConfigured(), sender: from ? { address: from.address, verified: from.verified } : null })
}

export async function PATCH(req: Request) {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const v = validateSettingsInput(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data: org } = await access.db.from('organisations').select('email_settings').eq('id', access.orgId).single()
  const next = { ...readSettings(org?.email_settings), ...v.value }
  const { error } = await access.db.from('organisations').update({ email_settings: next }).eq('id', access.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: next })
}
