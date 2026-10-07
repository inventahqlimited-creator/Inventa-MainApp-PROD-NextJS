// Sent by the browser (sendBeacon) as a support tab is closing or navigating away.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSupportEmail } from '@/lib/hub/support'
import { shortenLease, endSoonIfUnrenewed } from '@/lib/hub/support-lease'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSupportEmail(user.email)) return new NextResponse(null, { status: 204 })
  const db = createAdminClient()
  if (await shortenLease(db, user.id)) endSoonIfUnrenewed(db, user.id)
  return new NextResponse(null, { status: 204 })
}
