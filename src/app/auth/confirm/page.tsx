import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')

  if (error) return NextResponse.redirect(`${origin}/login?error=${error}`)

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)

    const user = data?.user
    if (user) {
      const meta = user.user_metadata as { org_id?: string; role?: string } | null

      if (meta?.org_id) {
        const admin = createAdminClient()

        await admin
          .from('org_members')
          .update({
            user_id:       user.id,
            invite_status: 'accepted',
            accepted_at:   new Date().toISOString(),
          })
          .eq('org_id', meta.org_id)
          .eq('email', user.email)
          .eq('invite_status', 'pending')
      }
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
