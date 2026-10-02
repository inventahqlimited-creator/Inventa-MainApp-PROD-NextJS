// src/app/api/integrations/xero/connect/route.ts
// Starts the Xero sign-in: remembers a signed one-time state, then sends the user to Xero.
import { NextResponse } from 'next/server'
import { xeroAuth } from '@/lib/xero/auth'
import { authorizeUrl, publicOrigin, STATE_COOKIE, xeroConfigured } from '@/lib/xero/client'
import { newState, sign } from '@/lib/xero/crypto'

export async function GET(req: Request) {
  const origin = publicOrigin(req)
  const back = (q: string) => NextResponse.redirect(`${origin}/settings?tab=integrations&xero=1&${q}`)

  const auth = await xeroAuth()
  if (!auth) return NextResponse.redirect(`${origin}/login`)
  if (!auth.enabled) return back('xero_error=not_enabled')
  if (!auth.isAdmin) return back('xero_error=admin_only')
  if (!xeroConfigured()) return back('xero_error=not_configured')

  const state = newState()
  const res = NextResponse.redirect(authorizeUrl(req, state))
  // The state is bound to this user and organisation, so a sign-in started by someone else can't be completed here
  res.cookies.set(STATE_COOKIE, `${state}.${sign(`${state}:${auth.userId}:${auth.orgId}`)}`, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    path: '/api/integrations/xero',
    maxAge: 600,
  })
  return res
}
