import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TransfersTable from '@/components/app/transfers-table'

export default async function TransfersPage() {
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

  const [{ data: transfers }, { data: locations }] = await Promise.all([
    adminClient
      .from('transfer_orders')
      .select('id, tr_number, from_location_id, to_location_id, from_location_name, to_location_name, status, transfer_date, expected_date, notes')
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
    <TransfersTable
      transfers={transfers ?? []}
      locations={locations ?? []}
      orgId={m.org_id}
    />
  )
}
