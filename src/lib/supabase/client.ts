import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/**
 * Client-side Supabase client.
 * Uses the anon key only. RLS applies.
 * Use this in Client Components ('use client').
 * Singleton pattern — only one instance per browser tab.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
