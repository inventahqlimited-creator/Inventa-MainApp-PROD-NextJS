// Everything the composer needs for one order: sender, defaults, signatures, templates, attachable documents.
import { NextResponse } from 'next/server'
import { requirePerm, can } from '@/lib/auth/access'
import { effectiveFrom, readSettings } from '@/lib/email/config'
import { DOC_PERM, MODULE_DOCS, MODULE_VIEW_PERM, isEmailModule, loadEmailContext } from '@/lib/email/context'
import { emailConfigured } from '@/lib/email/resend'

export async function GET(req: Request) {
  const gate = await requirePerm('send_emails')
  if ('res' in gate) return gate.res
  const { access } = gate
  const url = new URL(req.url)
  const module = url.searchParams.get('module')
  const id = url.searchParams.get('id') ?? ''
  if (!isEmailModule(module) || !id) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (!can(access, MODULE_VIEW_PERM[module])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: org } = await access.db.from('organisations').select('name, trading_name, email_settings').eq('id', access.orgId).single()
  const s = readSettings(org?.email_settings)
  const [ctx, { data: signatures }, { data: templates }] = await Promise.all([
    loadEmailContext(access.db, access.orgId, module, id, s.default_recipient),
    access.db.from('email_signatures').select('id, name, body_html, is_default').eq('org_id', access.orgId).order('name'),
    access.db.from('email_templates').select('id, name, module, subject, body_html, signature_id, is_default').eq('org_id', access.orgId).in('module', ['any', module]).order('name'),
  ])
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const companyName = org?.trading_name || org?.name || ''
  const from = effectiveFrom(s, companyName)
  return NextResponse.json({
    configured: emailConfigured() && !!from,
    sender: from ? { address: from.address, name: s.from_name || companyName, verified: from.verified } : null,
    replyTo: s.reply_to || access.email || '',
    defaultCc: s.default_cc,
    signatures: signatures ?? [],
    templates: templates ?? [],
    docs: MODULE_DOCS[module].filter(d => can(access, DOC_PERM[d.type])),
    doc: ctx,
    vars: { customer_name: ctx.recipientName, company_name: companyName, doc_number: ctx.ref, doc_type: ctx.docLabel, total: ctx.total, due_date: ctx.dueDate, sender_name: access.name ?? '' },
    canManage: can(access, 'manage_email_settings'),
  })
}
