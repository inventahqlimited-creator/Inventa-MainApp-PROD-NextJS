// Sends one email from an order: recipients, subject, body + signature, generated documents and uploaded files.
import { NextResponse } from 'next/server'
import { requirePerm, can } from '@/lib/auth/access'
import { effectiveFrom, parseAddresses, readSettings } from '@/lib/email/config'
import { DOC_PERM, MODULE_DOCS, MODULE_VIEW_PERM, isEmailModule, loadEmailContext } from '@/lib/email/context'
import { fillPlaceholders, htmlToText, wrapEmail } from '@/lib/email/render'
import { emailConfigured, sendEmail } from '@/lib/email/resend'
import { renderDocumentPdf, isDocType } from '@/lib/pdf'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
const MAX_FILES = 10
const MAX_TOTAL = 15 * 1024 * 1024
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|js|jse|vbs|vbe|ps1|sh|jar|dll|lnk|hta|iso)$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const gate = await requirePerm('send_emails')
  if ('res' in gate) return gate.res
  const { access } = gate
  if (!emailConfigured()) return NextResponse.json({ error: 'Email isn’t switched on yet. Ask your administrator.' }, { status: 503 })
  const rl = rateLimit(`email-send:${access.orgId}:${access.userId}`, 30, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: 'You’re sending a lot of email. Try again in a little while.' }, { status: 429 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const module = form.get('module')
  const id = String(form.get('id') ?? '')
  if (!isEmailModule(module) || !UUID.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (!can(access, MODULE_VIEW_PERM[module])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const to = parseAddresses(form.get('to')), cc = parseAddresses(form.get('cc')), bcc = parseAddresses(form.get('bcc'))
  const badAddr = [...to.bad, ...cc.bad, ...bcc.bad][0]
  if (badAddr) return NextResponse.json({ error: `“${badAddr}” isn’t a valid email address.` }, { status: 400 })
  if (!to.ok.length) return NextResponse.json({ error: 'Add at least one recipient.' }, { status: 400 })
  if (to.ok.length > 10 || cc.ok.length > 10 || bcc.ok.length > 10) return NextResponse.json({ error: 'Ten addresses at most in each of To, CC and BCC.' }, { status: 400 })
  const replyRaw = String(form.get('replyTo') ?? '').trim()
  const reply = replyRaw ? parseAddresses(replyRaw) : { ok: [] as string[], bad: [] as string[] }
  if (reply.bad.length || reply.ok.length > 1) return NextResponse.json({ error: 'Reply-to must be one valid email address.' }, { status: 400 })

  const subjectRaw = String(form.get('subject') ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (!subjectRaw) return NextResponse.json({ error: 'Add a subject.' }, { status: 400 })

  const [ctx, { data: org }] = await Promise.all([
    loadEmailContext(access.db, access.orgId, module, id),
    access.db.from('organisations').select('name, trading_name, email_settings').eq('id', access.orgId).single(),
  ])
  if (!ctx) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  const settings = readSettings(org?.email_settings)
  const companyName = org?.trading_name || org?.name || ''
  const from = effectiveFrom(settings, companyName)
  if (!from) return NextResponse.json({ error: 'No sending address is set up yet. Check Settings → Email.' }, { status: 400 })

  const vars = { customer_name: ctx.recipientName, company_name: companyName, doc_number: ctx.ref, doc_type: ctx.docLabel, total: ctx.total, due_date: ctx.dueDate, sender_name: access.name ?? '' }
  const subject = fillPlaceholders(subjectRaw, vars).slice(0, 250)
  const body = fillPlaceholders(String(form.get('body_html') ?? ''), vars, true)

  let signatureHtml = ''
  const sigId = String(form.get('signature_id') ?? '')
  if (UUID.test(sigId)) {
    const { data: sig } = await access.db.from('email_signatures').select('body_html').eq('id', sigId).eq('org_id', access.orgId).maybeSingle()
    signatureHtml = fillPlaceholders(sig?.body_html ?? '', vars, true)
  }

  // Attachments: generated documents (each needs the print permission) and the person's own files
  const attachments: { filename: string; content: Buffer }[] = []
  let docTypes: unknown[] = []
  try { docTypes = JSON.parse(String(form.get('docs') ?? '[]')) } catch { /* none */ }
  const allowedDocs = MODULE_DOCS[module].map(d => d.type)
  const seen = new Set<string>()
  for (const t of docTypes) {
    if (!isDocType(t) || !allowedDocs.includes(t) || seen.has(t)) continue
    seen.add(t)
    if (!can(access, DOC_PERM[t])) return NextResponse.json({ error: 'You don’t have permission to attach that document.' }, { status: 403 })
    try { const d = await renderDocumentPdf(access.db, access.orgId, t, id); attachments.push({ filename: d.filename, content: d.buffer }) }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the document.' }, { status: 400 }) }
  }
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string')
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Attach ${MAX_FILES} files or fewer.` }, { status: 400 })
  for (const f of files) {
    const name = f.name.replace(/[\\/\r\n\0]/g, '_').slice(0, 120) || 'file'
    if (BLOCKED.test(name)) return NextResponse.json({ error: `“${name}” can’t be sent by email (file type not allowed).` }, { status: 400 })
    attachments.push({ filename: name, content: Buffer.from(await f.arrayBuffer()) })
  }
  const total = attachments.reduce((n, a) => n + a.content.length, 0)
  if (total > MAX_TOTAL) return NextResponse.json({ error: 'Attachments are over 15 MB in total. Remove some and try again.' }, { status: 400 })

  const log = { org_id: access.orgId, sent_by: access.userId, sent_by_name: access.name, module, doc_id: id, doc_ref: ctx.ref, to_addresses: to.ok, cc_addresses: cc.ok, bcc_addresses: bcc.ok, from_address: from.address, subject, attachments: attachments.map(a => ({ name: a.filename, size: a.content.length })) }
  try {
    const sent = await sendEmail({
      from: from.header, to: to.ok, cc: cc.ok, bcc: bcc.ok, replyTo: reply.ok[0] || settings.reply_to || access.email || undefined,
      subject, html: wrapEmail(body, signatureHtml), attachments,
    })
    await access.db.from('email_log').insert({ ...log, status: 'sent', provider_id: sent.id })
    return NextResponse.json({ success: true, preview: htmlToText(body).slice(0, 80) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not send the email.'
    await access.db.from('email_log').insert({ ...log, status: 'failed', error: msg.slice(0, 500) })
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
