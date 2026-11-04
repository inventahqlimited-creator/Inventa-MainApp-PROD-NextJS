import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { sessionOnly } from '@/lib/auth/session-cookies'

/**
 * Client-side Supabase client.
 * Uses the anon key only. RLS applies.
 * Use this in Client Components ('use client').
 * Singleton pattern — only one instance per browser tab.
 * Sign-in cookies are session cookies: closing the browser signs the person out (see session-cookies.ts).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: browserSessionCookies }
  )
}

/** Cookie access for browser Supabase clients that keeps sign-in cookies to this browser session. */
export const browserSessionCookies = {
  getAll() {
    return parseCookieHeader(document.cookie).map(c => ({ name: c.name, value: c.value ?? '' }))
  },
  setAll(cookiesToSet: { name: string; value: string; options: Parameters<typeof serializeCookieHeader>[2] }[]) {
    cookiesToSet.forEach(({ name, value, options }) => {
      document.cookie = serializeCookieHeader(name, value, sessionOnly(options))
    })
  },
}
