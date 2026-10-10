// Heartbeat from an open support tab. 401 tells the page the session is over.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSupportEmail } from '@/lib/hub/support'
import { renewLease, sweepExpired } from '@/lib/hub/support-lease'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSupportEmail(user.email)) return NextResponse.json({ ok: false }, { status: 401 })
  const db = createAdminClient()
  const ok = await renewLease(db, user.id)
  void sweepExpired(db)
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 })
}
