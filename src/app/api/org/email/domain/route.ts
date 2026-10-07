// Own sending domain: add it (returns the DNS records to publish), re-check it, or remove it.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { isDomain, readSettings } from '@/lib/email/config'
import { createDomain, deleteDomain, emailConfigured, getDomain, verifyDomain } from '@/lib/email/resend'

async function load(access: { db: any; orgId: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: org } = await access.db.from('organisations').select('email_settings').eq('id', access.orgId).single()
  return readSettings(org?.email_settings)
}
async function save(access: { db: any; orgId: string }, s: unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return access.db.from('organisations').update({ email_settings: s }).eq('id', access.orgId)
}

export async function POST(req: Request) {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  if (!emailConfigured()) return NextResponse.json({ error: 'Email isn’t switched on for this platform yet.' }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  const domain = String(body.domain ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!isDomain(domain)) return NextResponse.json({ error: 'Enter a domain like acme.co.nz (no @ or https://).' }, { status: 400 })
  const cur = await load(access)
  if (cur.domain_id) await deleteDomain(cur.domain_id)
  try {
    const d = await createDomain(domain)
    const next = { ...cur, domain, domain_id: d.id, domain_status: d.status, domain_records: d.records }
    await save(access, next)
    return NextResponse.json({ settings: next })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not add the domain' }, { status: 400 })
  }
}

/** Ask for a re-check of the DNS records. */
export async function PUT() {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const cur = await load(access)
  if (!cur.domain_id) return NextResponse.json({ error: 'Add a domain first.' }, { status: 400 })
  try {
    const d = cur.domain_status === 'verified' ? await getDomain(cur.domain_id) : await verifyDomain(cur.domain_id)
    const next = { ...cur, domain_status: d.status, domain_records: d.records.length ? d.records : cur.domain_records }
    await save(access, next)
    return NextResponse.json({ settings: next })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not check the domain' }, { status: 400 })
  }
}

export async function DELETE() {
  const gate = await requirePerm('manage_email_settings')
  if ('res' in gate) return gate.res
  const { access } = gate
  const cur = await load(access)
  if (cur.domain_id) await deleteDomain(cur.domain_id)
  const next = { ...cur, domain: '', domain_id: '', domain_status: 'none' as const, domain_records: [] }
  await save(access, next)
  return NextResponse.json({ settings: next })
}
