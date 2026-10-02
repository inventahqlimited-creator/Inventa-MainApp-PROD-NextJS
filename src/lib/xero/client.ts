// src/lib/xero/client.ts
// Talking to Xero: sign-in URL, token exchange and refresh, listing the organisations a user approved.
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './crypto'

// Xero's granular scopes (required for new apps since March 2026) plus offline access so the connection survives
export const XERO_SCOPES = ['offline_access', 'accounting.invoices', 'accounting.contacts', 'accounting.settings'].join(' ')

const AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'

export const STATE_COOKIE = 'xero_oauth_state'

export type XeroTenant = { connectionId: string; tenantId: string; tenantName: string }
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string }

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_TOKEN_KEY)
}

/** The public address the user is on (behind the proxy the request's own URL is the internal one). */
export function publicOrigin(req: Request): string {
  const h = req.headers
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? new URL(req.url).host
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Where Xero sends the user back to. XERO_REDIRECT_URI wins; otherwise built from the public address. */
export function redirectUri(req: Request): string {
  return process.env.XERO_REDIRECT_URI || `${publicOrigin(req)}/api/integrations/xero/callback`
}

export function authorizeUrl(req: Request, state: string): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    scope: XERO_SCOPES,
    state,
  })
  return `${AUTH_URL}?${q.toString()}`
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(`Xero token request failed (${res.status})`)
  return json as TokenResponse
}

export const exchangeCode = (code: string, redirect: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect })

export const refreshTokens = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })

/** Every Xero organisation the user approved for this app. Practice (accountant) entries are left out. */
export async function listTenants(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not list Xero organisations (${res.status})`)
  const rows = (await res.json()) as { id: string; tenantId: string; tenantName: string; tenantType: string }[]
  return rows
    .filter(r => r.tenantType === 'ORGANISATION')
    .map(r => ({ connectionId: r.id, tenantId: r.tenantId, tenantName: r.tenantName }))
}

/** Withdraws this app's access to one Xero organisation (frees its slot in the app's connection limit). */
export async function removeConnection(accessToken: string, connectionId: string): Promise<boolean> {
  const res = await fetch(`${CONNECTIONS_URL}/${connectionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
  return res.ok
}

export type StoredTokens = { access_token: string; refresh_token: string; expires_in: number; scope?: string }

export function encryptedTokenColumns(t: StoredTokens) {
  return {
    access_token_enc: encrypt(t.access_token),
    refresh_token_enc: encrypt(t.refresh_token),
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scopes: t.scope ?? null,
  }
}

/**
 * A usable access token for the organisation's Xero connection, refreshed when it is about to expire.
 * Xero rotates refresh tokens, so the new one is saved straight away. A failed refresh marks the connection
 * as needing a reconnect.
 */
export async function getAccessToken(db: SupabaseClient, orgId: string): Promise<{ accessToken: string; tenantId: string; connectionId: string | null } | null> {
  const { data } = await db.from('xero_connections').select('*').eq('org_id', orgId).maybeSingle()
  const row = data as Record<string, string | null> | null
  if (!row || row.status !== 'connected' || !row.tenant_id || !row.access_token_enc || !row.refresh_token_enc) return null

  const expires = row.expires_at ? Date.parse(row.expires_at) : 0
  if (expires - Date.now() > 60_000) {
    return { accessToken: decrypt(row.access_token_enc), tenantId: row.tenant_id, connectionId: row.connection_id }
  }
  try {
    const t = await refreshTokens(decrypt(row.refresh_token_enc))
    await db.from('xero_connections').update({ ...encryptedTokenColumns(t), updated_at: new Date().toISOString() }).eq('org_id', orgId)
    return { accessToken: t.access_token, tenantId: row.tenant_id, connectionId: row.connection_id }
  } catch {
    await db.from('xero_connections').update({ status: 'needs_reconnect', updated_at: new Date().toISOString() }).eq('org_id', orgId)
    return null
  }
}
