// src/app/auth/timeout/route.ts
// Signs the person out and sends them to the login screen. Used when a session times out
// (reason=timeout, the default) and by the "Sign out" link on the blocked-network page (reason=signout).
import { createClient } from '@/lib/supabase/server'
import { redirectTo } from '@/lib/auth/redirect'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const reason = url.searchParams.get('reason')
  const supabase = await createClient()
  await supabase.auth.signOut()
  const res = redirectTo(reason === 'signout' ? '/login' : '/login?error=session_timeout')
  res.cookies.set('inv_la', '', { path: '/', maxAge: 0 })
  return res
}
