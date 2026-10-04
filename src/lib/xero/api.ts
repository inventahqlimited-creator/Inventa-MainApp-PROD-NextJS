// src/lib/xero/api.ts
// Calls to the Xero Accounting API for one Inventa organisation. Handles the access token
// (refreshing it when needed) and the tenant header, and turns failures into plain messages.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccessToken } from './client'

const BASE = 'https://api.xero.com/api.xro/2.0'

export type XeroResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function xeroRequest<T>(db: SupabaseClient, orgId: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<XeroResult<T>> {
  const auth = await getAccessToken(db, orgId)
  if (!auth) return { ok: false, status: 401, error: 'Xero is not connected. Reconnect Xero and try again.' }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'xero-tenant-id': auth.tenantId,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Xero. Please try again.' }
  }

  if (res.status === 429) return { ok: false, status: 429, error: 'Xero is busy right now (rate limit). Please try again in a minute.' }
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: 'Xero refused the request. Try disconnecting and connecting Xero again.' }
  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { Message?: string; Detail?: string; Elements?: { ValidationErrors?: { Message?: string }[] }[] }
      const reasons = (j.Elements ?? []).flatMap(e => (e.ValidationErrors ?? []).map(v => v.Message)).filter(Boolean)
      detail = reasons.length ? [...new Set(reasons)].join(' ') : (j.Message ?? j.Detail ?? '')
    } catch { /* no body */ }
    return { ok: false, status: res.status, error: detail ? `Xero said: ${detail}` : `Xero returned an error (${res.status}).` }
  }

  try {
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, status: 502, error: 'Xero sent a reply we could not read.' }
  }
}

export const xeroGet = <T>(db: SupabaseClient, orgId: string, path: string) => xeroRequest<T>(db, orgId, 'GET', path)
export const xeroPost = <T>(db: SupabaseClient, orgId: string, path: string, body: unknown) => xeroRequest<T>(db, orgId, 'POST', path, body)
