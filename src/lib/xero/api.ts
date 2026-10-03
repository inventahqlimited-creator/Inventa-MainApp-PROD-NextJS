// src/lib/xero/api.ts
// Calls to the Xero Accounting API for one Inventa organisation. Handles the access token
// (refreshing it when needed) and the tenant header, and turns failures into plain messages.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccessToken } from './client'

const BASE = 'https://api.xero.com/api.xro/2.0'

export type XeroResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

export async function xeroGet<T>(db: SupabaseClient, orgId: string, path: string): Promise<XeroResult<T>> {
  const auth = await getAccessToken(db, orgId)
  if (!auth) return { ok: false, status: 401, error: 'Xero is not connected. Reconnect Xero and try again.' }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}`, 'xero-tenant-id': auth.tenantId, Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Xero. Please try again.' }
  }

  if (res.status === 429) return { ok: false, status: 429, error: 'Xero is busy right now (rate limit). Please try again in a minute.' }
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: 'Xero refused the request. Try disconnecting and connecting Xero again.' }
  if (!res.ok) return { ok: false, status: res.status, error: `Xero returned an error (${res.status}).` }

  try {
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, status: 502, error: 'Xero sent a reply we could not read.' }
  }
}
