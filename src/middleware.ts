import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  const isHub = hostname === 'hub.inventahq.com'

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/health')

  if (isPublic) {
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL(isHub ? '/admin' : '/', request.url))
    }
    return supabaseResponse
  }

  if (isHub) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    const { data: members } = await supabase
      .from('org_members')
      .select('role, invite_status')
      .eq('user_id', user.id)
    const memberList = (members ?? []) as { role: string; invite_status: string }[]
    const isAdmin = memberList.some(m => m.role === 'admin' && m.invite_status === 'accepted')
    if (!isAdmin) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
