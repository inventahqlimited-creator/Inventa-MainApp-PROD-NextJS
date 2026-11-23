// GET — one sent email in full: who it went to (To, CC, BCC), subject, body, attachments. Opened from Order History.
// Emails sent before the body was kept are fetched back from the email service when it allows it.
import { NextResponse } from 'next/server'
import { requireAnyPerm } from '@/lib/auth/access'
import { getSentEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const gate = await requireAnyPerm('send_emails', 'manage_email_settings', 'view_sales_history', 'view_purchase_history', 'view_transfer_history')
  if ('res' in gate) return gate.res
  const { access } = gate
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const { data, error } = await access.db.from('email_log').select('*').eq('org_id', access.orgId).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const m = data as Record<string, unknown>

  let html = typeof m.body_html === 'string' ? m.body_html : null
  let replyTo = typeof m.reply_to === 'string' ? m.reply_to : null
  let bodyNote: string | null = null
  if (!html && typeof m.provider_id === 'string' && m.provider_id) {
    try {
      const sent = await getSentEmail(m.provider_id)
      html = sent.html ?? (sent.text ? `<pre style="font-family:inherit;white-space:pre-wrap">${sent.text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</pre>` : null)
      replyTo = replyTo ?? sent.replyTo
    } catch { /* not available */ }
  }
  if (!html) bodyNote = m.status === 'failed' ? 'This email wasn’t delivered, so there is no message body on record.' : 'The message body wasn’t kept for this email (it was sent before emails were saved in full).'

  return NextResponse.json({
    id: m.id, created_at: m.created_at, status: m.status, error: m.error ?? null, sent_by_name: m.sent_by_name ?? null,
    from: m.from_address ?? null, reply_to: replyTo, to: m.to_addresses ?? [], cc: m.cc_addresses ?? [], bcc: m.bcc_addresses ?? [],
    subject: m.subject ?? '', attachments: Array.isArray(m.attachments) ? m.attachments : [], html, body_note: bodyNote,
  })
}
