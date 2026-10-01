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
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js')

  // Audit log: every write carries the signed-in user's id (x-inventa-user header) so the database can
  // record who did it. Looked up once per client, and only for writes — reads are untouched.
  let uidPromise: Promise<string | null> | null = null
  const currentUserId = () => {
    if (!uidPromise) {
      uidPromise = (async () => {
        try {
          const supabase = await createClient()
          const { data: { session } } = await supabase.auth.getSession()
          return session?.user?.id ?? null
        } catch {
          return null // outside a request (scripts, webhooks) — logged as System
        }
      })()
    }
    return uidPromise
  }
  const auditFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'GET' || method === 'HEAD') return fetch(input, init)
    const uid = await currentUserId()
    if (!uid) return fetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('x-inventa-user', uid)
    return fetch(input, { ...init, headers })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: auditFetch } }
  )
}
