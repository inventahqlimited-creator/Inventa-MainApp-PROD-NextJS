// src/app/api/org/contact-defaults/route.ts — Settings → Contacts: defaults for new contacts.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { normalizeContactDefaults } from '@/lib/contact-defaults'

export async function PATCH(req: Request) {
  const g = await requirePerm('manage_contact_settings')
  if ('res' in g) return g.res
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('contact_defaults' in body)) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  const next = normalizeContactDefaults((body as { contact_defaults: unknown }).contact_defaults)
  const { error } = await g.access.db.from('organisations').update({ contact_defaults: next }).eq('id', g.access.orgId)
  if (error) {
    const missing = /contact_defaults/.test(error.message)
    return NextResponse.json({ error: missing ? 'Contact defaults aren’t ready yet — please contact support.' : 'We couldn’t save the defaults. Please try again.' }, { status: 500 })
  }
  await g.access.db.from('audit_log').insert({
    org_id: g.access.orgId, category: 'Settings', action: 'Contact Defaults Updated', ref: 'Contacts', detail: 'Default contact settings changed',
    entity_type: 'organisations', entity_id: g.access.orgId, user_id: g.access.userId, user_name: g.access.name,
  })
  return NextResponse.json({ success: true, contact_defaults: next })
}
