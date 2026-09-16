import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewAdjustment from '@/components/app/new-adjustment'

export default async function NewAdjustmentPage() {
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

  const [{ data: locations }, { data: products }, { data: stockLevels }] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
    adminClient
      .from('products')
      .select('id, name, sku, sell_uom, track_stock, type')
      .eq('org_id', m.org_id)
      .eq('is_active', true)
      .eq('track_stock', true)
      .order('name'),
    adminClient
      .from('stock_levels')
      .select('product_id, location_id, quantity')
      .eq('org_id', m.org_id),
  ])

  return (
    <NewAdjustment
      orgId={m.org_id}
      locations={locations ?? []}
      products={products ?? []}
      stockLevels={stockLevels ?? []}
    />
  )
}
