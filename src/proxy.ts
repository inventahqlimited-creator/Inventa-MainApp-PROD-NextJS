import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
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
  const { pathname, hostname } = request.nextUrl

  // hub.inventahq.com → always route to /admin/*
  const isHubSubdomain = hostname === 'hub.inventahq.com'

  // Public routes — always accessible
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/health')

  if (isPublic) {
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL(isHubSubdomain ? '/admin' : '/', request.url))
    }
    return supabaseResponse
  }

  // No session — redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', isHubSubdomain ? '/admin' : pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Hub subdomain — enforce /admin prefix and admin role
  if (isHubSubdomain) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    if (!pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const m = membership as { role: string } | null
    if (!m || m.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Main app — block non-admins from /admin
  if (pathname.startsWith('/admin')) {
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const m = membership as { role: string } | null
    if (!m || m.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
