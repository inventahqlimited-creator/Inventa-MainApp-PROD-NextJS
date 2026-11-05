// src/app/auth/accept/route.ts
// Called by the "Setting up your account" screen after an invite link signs the person in: accepts their invite.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { acceptPendingInvite } from '@/lib/auth/accept-invite'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accepted = await acceptPendingInvite(createAdminClient(), user)
  return NextResponse.json({ success: true, accepted })
}
