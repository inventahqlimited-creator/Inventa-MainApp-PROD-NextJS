import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewSalesOrder from '@/components/app/new-sales-order'

export default async function NewSalesOrderPage() {
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

  const [{ data: customers }, { data: locations }, { data: products }] = await Promise.all([
    adminClient
      .from('contacts')
      .select('id, name, email, phone, bill_city, bill_country, terms, currency')
      .eq('org_id', m.org_id)
      .eq('type', 'customer')
      .eq('is_active', true)
      .order('name'),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
    adminClient
      .from('products')
      .select('id, name, sku, sell_uom, sell_price, tax_rate, description, track_stock, type')
      .eq('org_id', m.org_id)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <NewSalesOrder
      orgId={m.org_id}
      customers={customers ?? []}
      locations={locations ?? []}
      products={products ?? []}
    />
  )
}
