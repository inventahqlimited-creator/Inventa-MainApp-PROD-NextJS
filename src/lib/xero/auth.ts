// src/lib/xero/auth.ts
// Who is calling, which organisation they belong to, and whether they may manage Xero for it.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { setActor } from './audit'
import { getAccess, can } from '@/lib/auth/access'

export type XeroAuth = {
  userId: string
  orgId: string
  isAdmin: boolean
  enabled: boolean // Xero switched on for this organisation (organisations.xero_enabled)
  db: ReturnType<typeof createAdminClient>
}

/** May this person see the Xero page and status? Admins always; others need "View Xero page and status". */
export async function canViewXero(a: XeroAuth): Promise<boolean> {
  if (a.isAdmin) return true
  const access = await getAccess()
  return !!access && can(access, 'xero_view')
}

export async function xeroAuth(): Promise<XeroAuth | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id, role, first_name, last_name').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return null
  const member = m as { org_id: string; role: string; first_name: string | null; last_name: string | null }
  setActor(db, { id: user.id, name: [member.first_name, member.last_name].filter(Boolean).join(' ') || user.email || null })
  const { data: org } = await db.from('organisations').select('xero_enabled').eq('id', member.org_id).single()
  return {
    userId: user.id,
    orgId: member.org_id,
    isAdmin: member.role === 'admin',
    enabled: Boolean((org as { xero_enabled?: boolean | null } | null)?.xero_enabled),
    db,
  }
}
