// Thin Resend client over fetch (no SDK). One platform API key; each customer's domain lives in that account.
import type { DnsRecord } from './config'

const API = 'https://api.resend.com'
export const emailConfigured = () => !!process.env.RESEND_API_KEY

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Email isn’t switched on for this platform yet.')
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* leave empty */ }
  if (!res.ok) throw new Error(typeof json.message === 'string' ? json.message : `Email service error (${res.status})`)
  return json as T
}

type ResendDomain = { id: string; name: string; status: string; records?: DnsRecord[] }
export const mapStatus = (s: string): 'pending' | 'verified' | 'failed' => s === 'verified' ? 'verified' : (s === 'failed' || s === 'temporary_failure') ? 'failed' : 'pending'

export async function createDomain(name: string) {
  const d = await call<ResendDomain>('POST', '/domains', { name })
  return { id: d.id, status: mapStatus(d.status), records: d.records ?? [] }
}
export async function getDomain(id: string) {
  const d = await call<ResendDomain>('GET', `/domains/${encodeURIComponent(id)}`)
  return { id: d.id, status: mapStatus(d.status), records: d.records ?? [] }
}
export async function verifyDomain(id: string) {
  await call('POST', `/domains/${encodeURIComponent(id)}/verify`)
  return getDomain(id)
}
export async function deleteDomain(id: string) {
  try { await call('DELETE', `/domains/${encodeURIComponent(id)}`) } catch { /* already gone */ }
}

export type OutgoingEmail = {
  from: string; to: string[]; cc?: string[]; bcc?: string[]; replyTo?: string
  subject: string; html: string; attachments?: { filename: string; content: Buffer }[]
}
export async function sendEmail(m: OutgoingEmail): Promise<{ id: string }> {
  const r = await call<{ id: string }>('POST', '/emails', {
    from: m.from, to: m.to, cc: m.cc?.length ? m.cc : undefined, bcc: m.bcc?.length ? m.bcc : undefined,
    reply_to: m.replyTo || undefined, subject: m.subject, html: m.html,
    attachments: m.attachments?.map(a => ({ filename: a.filename, content: a.content.toString('base64') })),
  })
  return { id: r.id }
}
