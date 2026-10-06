// src/app/api/org/notification-settings/route.ts
// Saves which alerts the bell shows. Needs the "manage company settings" permission.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { normalizeNotifications } from '@/lib/notifications/config'

export async function PATCH(req: Request) {
  const g = await requirePerm('manage_company')
  if ('res' in g) return g.res
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('notification_settings' in body)) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  const next = normalizeNotifications((body as { notification_settings: unknown }).notification_settings)
  const { error } = await g.access.db.from('organisations').update({ notification_settings: next }).eq('id', g.access.orgId)
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true, notification_settings: next })
}
