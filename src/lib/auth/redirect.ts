// src/lib/auth/redirect.ts
// Redirect to another page on this site using a RELATIVE address.
// Behind Fly's proxy the app sees its own internal address (0.0.0.0:3000) in request.url, so building an absolute
// address from it sends people to the wrong place. The browser resolves a relative Location against the address
// it actually used (app. / hub. / staging.), which is always correct.
import { NextResponse } from 'next/server'

export function redirectTo(path: string): NextResponse {
  const safe = /^\/(?![/\\])/.test(path) ? path : '/'
  return new NextResponse(null, { status: 307, headers: { Location: safe } })
}
