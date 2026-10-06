// Lands here from the Hub's "Open InventaHQ" button. One-time, short-lived, signed link → signed in as the Hub admin's
// support identity for exactly one organisation.
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirectTo } from '@/lib/auth/redirect'
import { verifySupportLink, isSupportEmail } from '@/lib/hub/support'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const th = sp.get('th') ?? ''
  const orgId = sp.get('o') ?? ''
  const exp = Number(sp.get('exp'))
  if (!verifySupportLink(th, orgId, exp, sp.get('sig') ?? '')) return redirectTo('/login?error=support_link')

  const supabase = await createClient()
  await supabase.auth.signOut() // never carry another person's session into a support session
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: th, type: 'magiclink' })
  const uid = data?.user?.id
  if (error || !uid) return redirectTo('/login?error=support_link')

  // belt and braces: this login must be a support identity that belongs to the organisation in the link
  const { data: m } = await createAdminClient().from('org_members').select('email').eq('user_id', uid).eq('org_id', orgId).eq('invite_status', 'accepted').maybeSingle()
  if (!m || !isSupportEmail((m as { email: string | null }).email)) {
    await supabase.auth.signOut()
    return redirectTo('/login?error=support_link')
  }
  return redirectTo('/dashboard')
}
