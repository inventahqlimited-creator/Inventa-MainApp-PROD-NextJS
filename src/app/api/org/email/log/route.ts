import { NextResponse } from 'next/server'
import { requireAnyPerm } from '@/lib/auth/access'
import { isEmailModule } from '@/lib/email/context'

/** Recent emails sent from one order (or the latest for the whole organisation). */
export async function GET(req: Request) {
  const gate = await requireAnyPerm('send_emails', 'manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const u = new URL(req.url)
  const id = u.searchParams.get('id')
  const module = u.searchParams.get('module')
  let q = access.db.from('email_log').select('id, created_at, sent_by_name, module, doc_ref, to_addresses, subject, status, error').eq('org_id', access.orgId).order('created_at', { ascending: false }).limit(50)
  if (id) q = q.eq('doc_id', id)
  if (module && isEmailModule(module)) q = q.eq('module', module)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
