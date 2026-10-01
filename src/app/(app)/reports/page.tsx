// src/app/(app)/reports/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportsHome from '@/components/app/reports-home'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: m } = await admin.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').maybeSingle()
  if (!m) redirect('/login')

  return <ReportsHome />
}
