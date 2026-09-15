import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SalesTable from '@/components/app/sales-table'

export default async function SalesPage() {
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

  const [{ data: orders }, { data: contacts }, { data: locations }] = await Promise.all([
    adminClient
      .from('sales_orders')
      .select('id, so_number, status, order_date, expected_date, delivery_date, total_amount, customer_id, customer_name, location_id, location_name, notes, ref, terms, currency')
      .eq('org_id', m.org_id)
      .order('created_at', { ascending: false }),
    adminClient
      .from('contacts')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('type', 'customer')
      .eq('is_active', true),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true),
  ])

  return (
    <SalesTable
      orders={orders ?? []}
      contacts={contacts ?? []}
      locations={locations ?? []}
      orgId={m.org_id}
    />
  )
}
