// src/lib/xero/auth.ts
// Who is calling, which organisation they belong to, and whether they may manage Xero for it.
import { createAdminClient, createClient } from '@/lib/supabase/server'

export type XeroAuth = {
  userId: string
  orgId: string
  isAdmin: boolean
  enabled: boolean // Xero switched on for this organisation (organisations.xero_enabled)
  db: ReturnType<typeof createAdminClient>
}

export async function xeroAuth(): Promise<XeroAuth | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id, role').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return null
  const member = m as { org_id: string; role: string }
  const { data: org } = await db.from('organisations').select('xero_enabled').eq('id', member.org_id).single()
  return {
    userId: user.id,
    orgId: member.org_id,
    isAdmin: member.role === 'admin',
    enabled: Boolean((org as { xero_enabled?: boolean | null } | null)?.xero_enabled),
    db,
  }
}
