import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdjustmentsTable from '@/components/app/adjustments-table'

export default async function AdjustmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) redirect('/login')
  const m = membership as { org_id: string; role: string }

  const [{ data: adjustments }, { data: locations }] = await Promise.all([
    adminClient
      .from('adjustment_orders')
      .select('id, adj_number, location_id, location_name, status, adjustment_date, reason, notes')
      .eq('org_id', m.org_id)
      .order('created_at', { ascending: false }),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
  ])

  return (
    <AdjustmentsTable
      adjustments={adjustments ?? []}
      locations={locations ?? []}
      orgId={m.org_id}
    />
  )
}
