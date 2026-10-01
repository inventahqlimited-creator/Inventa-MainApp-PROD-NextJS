// src/app/(app)/audit/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AuditLog from '@/components/app/audit-log'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('role').eq('user_id', user.id).eq('invite_status', 'accepted').limit(1).maybeSingle()
  if (!m) redirect('/login')
  const allowed = ['admin', 'owner'].includes(String((m as { role: string }).role).toLowerCase())

  return <AuditLog allowed={allowed} />
}
