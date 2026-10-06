import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const MIN = 60_000
const HOUR = 60 * MIN

/** Returns a 429 response if this request is over its limit, otherwise null. */
function limited(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl
  const method = request.method
  const ip = clientIp(request.headers)
  const rules: { key: string; limit: number; windowMs: number }[] = []

  if (method === 'POST' && pathname === '/auth/forgot') rules.push({ key: 'forgot', limit: 5, windowMs: 15 * MIN })
  if (method === 'POST' && (
    pathname === '/api/admin/invite' || pathname === '/api/admin/resend-invite' ||
    pathname === '/api/org/invite' || pathname === '/api/org/resend-invite' ||
    /^\/api\/org\/members\/[^/]+\/reset-password$/.test(pathname)
  )) rules.push({ key: 'email-send', limit: 30, windowMs: HOUR })
  if (pathname.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') rules.push({ key: 'api-write', limit: 240, windowMs: MIN })
    rules.push({ key: 'api-all', limit: 900, windowMs: MIN })
  }

  for (const r of rules) {
    const res = rateLimit(`${r.key}:${ip}`, r.limit, r.windowMs)
    if (!res.ok) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests. Please slow down and try again shortly.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(res.retryAfter) },
      })
    }
  }
  return null
}

export async function middleware(request: NextRequest) {
  const blocked = limited(request)
  if (blocked) return blocked

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Which site was asked for. Behind Fly's proxy request.nextUrl shows the app's own internal address (0.0.0.0),
  // so read the Host header the browser actually used instead.
  const host = (request.headers.get('host') ?? request.nextUrl.hostname).split(':')[0].toLowerCase()
  const hubHosts = (process.env.HUB_HOSTS || 'hub.inventahq.com').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
  const isHub = hubHosts.includes(host)
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const go = (path: string) => NextResponse.redirect(new URL(path, `${proto}://${request.headers.get('host') ?? request.nextUrl.host}`))

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/health')

  if (isPublic) {
    if (user && pathname === '/login') {
      return go(isHub ? '/admin' : '/')
    }
    return supabaseResponse
  }

  if (isHub) {
    if (!user) {
      return go('/login')
    }
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
      return go('/admin')
    }
    const { data: members } = await supabase
      .from('org_members')
      .select('role, invite_status')
      .eq('user_id', user.id)
      .eq('org_id', process.env.PLATFORM_ORG_ID || '00000000-0000-0000-0000-000000000001')
    const memberList = (members ?? []) as { role: string; invite_status: string }[]
    const isAdmin = memberList.some(m => m.role === 'admin' && m.invite_status === 'accepted')
    if (!isAdmin) {
      await supabase.auth.signOut()
      return go('/login')
    }
    return supabaseResponse
  }

  if (pathname.startsWith('/admin')) {
    return go('/dashboard')
  }

  if (!user) {
    const loginUrl = new URL('/login', `${proto}://${request.headers.get('host') ?? request.nextUrl.host}`)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Remember when this person last opened a page — the app layout uses it to enforce the session timeout.
  // Background API calls don't count as activity.
  if (!pathname.startsWith('/api/')) {
    supabaseResponse.cookies.set('inv_la', String(Date.now()), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7,
    })
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
