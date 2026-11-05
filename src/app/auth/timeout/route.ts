// src/app/auth/timeout/route.ts
// Signs the person out and sends them to the login screen. Used when a session times out
// (reason=timeout, the default), by the "Sign out" link on the blocked-network page (reason=signout) and after a new
// person sets their password (reason=welcome).
import { createClient } from '@/lib/supabase/server'
import { redirectTo } from '@/lib/auth/redirect'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const reason = url.searchParams.get('reason')
  const supabase = await createClient()
  await supabase.auth.signOut()
  // welcome: a newly invited person has just chosen their password and signs in again
  const res = redirectTo(reason === 'signout' ? '/login' : reason === 'welcome' ? '/login?welcome=1' : '/login?error=session_timeout')
  res.cookies.set('inv_la', '', { path: '/', maxAge: 0 })
  return res
}
