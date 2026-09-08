import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware runs on every request BEFORE the page renders.
 * This is the real auth guard — not JavaScript in the browser.
 *
 * Rules:
 *  - Public routes (/login, /auth/*) — always accessible
 *  - Admin routes (/admin/*) — session + admin role required
 *  - Everything else — session required
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // A simple mistake could make it very hard to debug issues with
  // users being randomly logged out.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes — no auth needed
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth')
  if (isPublic) {
    // If already logged in, redirect away from login
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return supabaseResponse
  }

  // No session — redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes — check role
  if (pathname.startsWith('/admin')) {
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      // Authenticated but not admin — redirect to app root
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public asset files
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
