import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProductsTable from '@/components/app/products-table'

export default async function ProductsPage() {
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

  const [{ data: products }, { data: stockLevels }, { data: locations }, { data: suppliers }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, name, sku, description, type, unit, unit_sell, unit_buy, unit_buy_qty, unit_sell_qty, sell_price, cost_price, is_active, track_stock, low_stock_threshold, barcode, default_supplier_id, last_cost, avg_cost, batch_tracking, serial_tracking, expiry_tracking, supplier_code, lead_time_days, min_order_qty, notes, tax_rate')
      .eq('org_id', m.org_id)
      .order('name', { ascending: true }),
    adminClient
      .from('stock_levels')
      .select('product_id, location_id, quantity, on_order, committed, on_hold, reserved_quantity')
      .eq('org_id', m.org_id),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true),
    adminClient
      .from('contacts')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('type', 'supplier')
      .eq('is_active', true),
  ])

  return (
    <ProductsTable
      products={products ?? []}
      stockLevels={stockLevels ?? []}
      locations={locations ?? []}
      suppliers={suppliers ?? []}
      orgId={m.org_id}
      isAdmin={m.role === 'admin'}
    />
  )
}
