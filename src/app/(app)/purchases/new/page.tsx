import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewPurchaseOrder from '@/components/app/new-purchase-order'

export default async function NewPurchaseOrderPage() {
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

  const [{ data: suppliers }, { data: locations }, { data: products }] = await Promise.all([
    adminClient
      .from('contacts')
      .select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency')
      .eq('org_id', m.org_id)
      .eq('type', 'supplier')
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
      .select('id, name, sku, buy_uom, cost_price, tax_rate, description, track_stock, type')
      .eq('org_id', m.org_id)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <NewPurchaseOrder
      orgId={m.org_id}
      suppliers={suppliers ?? []}
      locations={locations ?? []}
      products={products ?? []}
    />
  )
}
