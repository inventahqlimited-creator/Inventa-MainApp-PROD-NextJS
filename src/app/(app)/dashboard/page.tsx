import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from '@/components/app/dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id, role, first_name, last_name')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) redirect('/login')
  const m = membership as { org_id: string; role: string; first_name: string | null; last_name: string | null }

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  const [
    { data: salesOrders },
    { data: purchaseOrders },
    { data: stockLevels },
    { data: products },
    { data: locations },
    { data: org },
  ] = await Promise.all([
    adminClient
      .from('sales_orders')
      .select('id, so_number, status, order_date, total_amount, customer_name, location_id, expected_date, shipped_date')
      .eq('org_id', m.org_id)
      .gte('order_date', sixMonthsAgo),
    adminClient
      .from('purchase_orders')
      .select('id, po_number, status, order_date, total_amount, supplier_name, expected_date')
      .eq('org_id', m.org_id)
      .order('created_at', { ascending: false })
      .limit(100),
    adminClient
      .from('stock_levels')
      .select('product_id, location_id, quantity, on_order, committed')
      .eq('org_id', m.org_id),
    adminClient
      .from('products')
      .select('id, name, sku, type, sell_price, cost_price, avg_cost, low_stock_threshold, is_active, track_stock')
      .eq('org_id', m.org_id)
      .eq('is_active', true),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true),
    adminClient
      .from('organisations')
      .select('name')
      .eq('id', m.org_id)
      .single(),
  ])

  const displayName = [m.first_name, m.last_name].filter(Boolean).join(' ') || user.email || 'there'
  const orgName = (org as { name: string } | null)?.name ?? 'inventaHQ'

  return (
    <DashboardClient
      salesOrders={salesOrders ?? []}
      purchaseOrders={purchaseOrders ?? []}
      stockLevels={stockLevels ?? []}
      products={products ?? []}
      locations={locations ?? []}
      displayName={displayName}
      orgName={orgName}
      thisMonthStart={thisMonthStart}
      lastMonthStart={lastMonthStart}
      lastMonthEnd={lastMonthEnd}
    />
  )
}
