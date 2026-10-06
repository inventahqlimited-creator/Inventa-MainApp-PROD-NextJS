// src/app/(app)/audit/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { loadSecurity } from '@/lib/auth/security-settings'
import AuditLog from '@/components/app/audit-log'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('role').eq('user_id', user.id).eq('invite_status', 'accepted').limit(1).maybeSingle()
  if (!m) redirect('/login')
  const allowed = ['admin', 'owner'].includes(String((m as { role: string }).role).toLowerCase())

  // The organisation can switch the audit log off — then nobody can open it
  const access = await getAccess()
  const enabled = access ? (await loadSecurity(adminClient, access.orgId)).audit_log_enabled : false

  return <AuditLog allowed={allowed && enabled} disabled={!enabled} />
}
