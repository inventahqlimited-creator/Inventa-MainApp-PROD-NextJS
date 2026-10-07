// Validation for the saved signatures and templates.
import { cleanHtml } from './render'

const MODULES = ['any', 'sales', 'purchases', 'transfers'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function cleanSignature(b: Record<string, unknown>): { value: { name: string; body_html: string; is_default: boolean } } | { error: string } {
  const name = String(b.name ?? '').trim().slice(0, 80)
  if (!name) return { error: 'Give the signature a name.' }
  const body_html = cleanHtml(String(b.body_html ?? '')).slice(0, 20000)
  return { value: { name, body_html, is_default: b.is_default === true } }
}

export function cleanTemplate(b: Record<string, unknown>): { value: { name: string; module: string; subject: string; body_html: string; signature_id: string | null; is_default: boolean } } | { error: string } {
  const name = String(b.name ?? '').trim().slice(0, 80)
  if (!name) return { error: 'Give the template a name.' }
  const module = String(b.module ?? 'any')
  if (!(MODULES as readonly string[]).includes(module)) return { error: 'Unknown module.' }
  const subject = String(b.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  const body_html = cleanHtml(String(b.body_html ?? '')).slice(0, 50000)
  const sid = b.signature_id ? String(b.signature_id) : null
  if (sid && !UUID.test(sid)) return { error: 'Unknown signature.' }
  return { value: { name, module, subject, body_html, signature_id: sid, is_default: b.is_default === true } }
}
