import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/auth/platform-admin'

/** For /api/admin/* routes: the caller must be a Hub (platform) admin. */
export async function requireHub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = createAdminClient()
  if (!(await isPlatformAdmin(db, user.id))) return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db, user: { id: user.id, email: user.email ?? null } }
}
