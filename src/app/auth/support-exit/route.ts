// "Exit to Hub" from a support session: closes the support access and returns to the Hub.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSupportEmail, hubUrl } from '@/lib/hub/support'
import { endSupport } from '@/lib/hub/support-lease'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let toHub = false
  if (user && isSupportEmail(user.email)) {
    await endSupport(createAdminClient(), user.id)
    toHub = true
  }
  await supabase.auth.signOut()
  return new NextResponse(null, { status: 307, headers: { Location: toHub ? `${hubUrl()}/admin` : '/login' } })
}
