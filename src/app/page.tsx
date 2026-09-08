import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Root page — resolves to the right destination based on auth state.
 * Middleware already guards this route, so if we reach here the user
 * is authenticated. Just redirect to the main app view.
 */
export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Default app landing — will become the dashboard in Phase 5
  redirect('/dashboard')
}
