// src/app/api/integrations/xero/callback/route.ts
// Xero sends the user back here with a one-time code. We swap it for tokens, see which Xero organisations
// the user approved, and either connect the only one or let the user pick.
import { NextResponse } from 'next/server'
import { xeroAuth } from '@/lib/xero/auth'
import { encryptedTokenColumns, exchangeCode, listTenants, publicOrigin, redirectUri, STATE_COOKIE } from '@/lib/xero/client'
import { safeEqual, sign } from '@/lib/xero/crypto'

export async function GET(req: Request) {
  const origin = publicOrigin(req)
  const url = new URL(req.url)
  const done = (q: string) => {
    const res = NextResponse.redirect(`${origin}/settings?tab=integrations&xero=1&${q}`)
    res.cookies.set(STATE_COOKIE, '', { path: '/api/integrations/xero', maxAge: 0 })
    return res
  }

  const auth = await xeroAuth()
  if (!auth) return NextResponse.redirect(`${origin}/login`)
  if (!auth.enabled) return done('xero_error=not_enabled')
  if (!auth.isAdmin) return done('xero_error=admin_only')

  if (url.searchParams.get('error')) return done('xero_error=denied')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''

  // The state must match the cookie set when the sign-in started, and be signed for this user and organisation
  const cookie = req.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1) ?? ''
  const [cookieState, cookieSig] = cookie.split('.')
  let stateOk = false
  try {
    stateOk = Boolean(code && state && cookieState === state && cookieSig && safeEqual(cookieSig, sign(`${state}:${auth.userId}:${auth.orgId}`)))
  } catch {
    stateOk = false
  }
  if (!stateOk || !code) return done('xero_error=state')

  try {
    const tokens = await exchangeCode(code, redirectUri(req))
    const tenants = await listTenants(tokens.access_token)
    if (tenants.length === 0) return done('xero_error=no_org')

    const now = new Date().toISOString()
    const base = { org_id: auth.orgId, ...encryptedTokenColumns(tokens), connected_by: auth.userId, updated_at: now }
    const only = tenants.length === 1 ? tenants[0] : null
    const row = only
      ? { ...base, status: 'connected', tenant_id: only.tenantId, tenant_name: only.tenantName, connection_id: only.connectionId, pending_tenants: null, connected_at: now }
      : { ...base, status: 'pending', tenant_id: null, tenant_name: null, connection_id: null, pending_tenants: tenants, connected_at: null }

    // One Xero connection per Inventa organisation: org_id is unique, so a new sign-in replaces the old one
    const { error } = await auth.db.from('xero_connections').upsert(row, { onConflict: 'org_id' })
    if (error) return done('xero_error=failed')
    return done(only ? 'xero_ok=connected' : 'xero_ok=choose')
  } catch {
    return done('xero_error=failed')
  }
}
