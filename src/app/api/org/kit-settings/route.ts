// src/app/api/org/kit-settings/route.ts
// Settings > Kits & Bundles. GET: anyone signed in (screens need it). PATCH: needs "manage company settings" and the add-on switched on.
import { NextResponse } from 'next/server'
import { getAccess, requirePerm } from '@/lib/auth/access'
import { ADDON_OFF_MESSAGE, hasAddon } from '@/lib/addons-server'
import { normalizeKitSettings } from '@/lib/kits/settings'
import { loadKitSettings } from '@/lib/kits/settings-server'

export async function GET() {
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ enabled: await hasAddon(access.db, access.orgId, 'kits'), settings: await loadKitSettings(access.db, access.orgId) })
}

export async function PATCH(req: Request) {
  const g = await requirePerm('manage_company')
  if ('res' in g) return g.res
  if (!(await hasAddon(g.access.db, g.access.orgId, 'kits'))) return NextResponse.json({ error: ADDON_OFF_MESSAGE }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('kit_settings' in body)) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  const next = normalizeKitSettings((body as { kit_settings: unknown }).kit_settings)
  const { error } = await g.access.db.from('organisations').update({ kit_settings: next }).eq('id', g.access.orgId)
  if (error) {
    const missing = /kit_settings/.test(error.message)
    return NextResponse.json({ error: missing ? 'Kit settings aren’t ready yet — please contact support.' : 'We couldn’t save the settings. Please try again.' }, { status: 500 })
  }
  await g.access.db.from('audit_log').insert({
    org_id: g.access.orgId, category: 'Settings', action: 'Kit Settings Updated', ref: 'Kits & Bundles', detail: 'Kits & Bundles settings changed',
    entity_type: 'organisations', entity_id: g.access.orgId, user_id: g.access.userId, user_name: g.access.name,
  })
  return NextResponse.json({ success: true, kit_settings: next })
}
