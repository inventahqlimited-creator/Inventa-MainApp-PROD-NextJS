// src/lib/xero/guard.ts
// Shared checks for the Xero API routes: logged in, Xero switched on, connected, and (for changes) an admin.
import { NextResponse } from 'next/server'
import { xeroAuth, type XeroAuth } from './auth'
import type { XeroSettings } from './mapping'

export async function guardXero(needAdmin: boolean): Promise<{ a: XeroAuth; settings: XeroSettings } | { res: NextResponse }> {
  const a = await xeroAuth()
  if (!a) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!a.enabled) return { res: NextResponse.json({ error: 'Xero isn’t switched on for your organisation.' }, { status: 403 }) }
  if (needAdmin && !a.isAdmin) return { res: NextResponse.json({ error: 'Only admins can post to Xero.' }, { status: 403 }) }

  const { data } = await a.db.from('xero_connections').select('status, settings').eq('org_id', a.orgId).maybeSingle()
  const row = data as { status: string; settings: XeroSettings | null } | null
  if (!row || row.status !== 'connected') return { res: NextResponse.json({ error: 'Xero is not connected. Connect Xero in Settings first.' }, { status: 409 }) }
  return { a, settings: row.settings ?? {} }
}

export const parseEntity = (v: unknown): 'contact' | 'product' | null => (v === 'contact' || v === 'product' ? v : null)
