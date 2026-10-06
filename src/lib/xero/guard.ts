// src/lib/xero/guard.ts
// Shared checks for the Xero API routes: logged in, Xero switched on, connected, and (for changes) an admin.
import { NextResponse } from 'next/server'
import { xeroAuth, canViewXero, type XeroAuth } from './auth'
import type { XeroSettings } from './mapping'
import { normalizePrefs, type XeroPrefs } from './prefs'

export async function guardXero(needAdmin: boolean): Promise<{ a: XeroAuth; settings: XeroSettings; prefs: XeroPrefs } | { res: NextResponse }> {
  const a = await xeroAuth()
  if (!a) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!a.enabled) return { res: NextResponse.json({ error: 'Xero isn’t switched on for your organisation.' }, { status: 403 }) }
  if (!(await canViewXero(a))) return { res: NextResponse.json({ error: 'You don’t have permission to view Xero.' }, { status: 403 }) }
  if (needAdmin && !a.isAdmin) return { res: NextResponse.json({ error: 'Only admins can post to Xero.' }, { status: 403 }) }

  const { data } = await a.db.from('xero_connections').select('status, settings, preferences').eq('org_id', a.orgId).maybeSingle()
  const row = data as { status: string; settings: XeroSettings | null; preferences: unknown } | null
  if (!row || row.status !== 'connected') return { res: NextResponse.json({ error: 'Xero is not connected. Connect Xero in Settings first.' }, { status: 409 }) }
  return { a, settings: row.settings ?? {}, prefs: normalizePrefs(row.preferences) }
}

export const parseEntity = (v: unknown): 'contact' | 'product' | null => (v === 'contact' || v === 'product' ? v : null)
