// "Exit to Hub" from a support session: closes the support access and returns to the Hub.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSupportEmail, hubUrl } from '@/lib/hub/support'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let toHub = false
  if (user && isSupportEmail(user.email)) {
    const db = createAdminClient()
    await db.from('org_members').update({ invite_status: 'inactive' }).eq('user_id', user.id)
    await db.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })
    toHub = true
  }
  await supabase.auth.signOut()
  return new NextResponse(null, { status: 307, headers: { Location: toHub ? `${hubUrl()}/admin` : '/login' } })
}
