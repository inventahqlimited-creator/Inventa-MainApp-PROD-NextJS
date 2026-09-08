import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

/**
 * Server-side Supabase client.
 * Uses the anon key + the user's session cookie.
 * RLS applies — the user only sees data their session allows.
 * Use this in Server Components, Server Actions, and Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — cookies can't be
            // mutated there, but middleware will refresh the session.
          }
        },
      },
    }
  )
}

/**
 * Admin Supabase client with service role key.
 * Bypasses RLS — use ONLY in trusted server-side code.
 * NEVER import this in client components.
 */
export function createAdminClient() {
  // Dynamic import to prevent accidental client-side bundling
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
