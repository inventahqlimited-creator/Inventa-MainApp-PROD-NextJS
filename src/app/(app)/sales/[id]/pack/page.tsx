// src/app/(app)/sales/[id]/pack/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PackSalesOrder from '@/components/app/pack-sales-order'

export default async function PackSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!membership) redirect('/login')
  const orgId = (membership as { org_id: string }).org_id

  const { data: order } = await adminClient
    .from('sales_orders')
    .select(`
      id, so_number, status, customer_name, location_name,
      carrier, shipping_method, service_type, tracking_number,
      sales_order_lines ( id, product_name, product_sku, unit, quantity_picked, sort_order )
    `)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()
  if (!order) redirect('/sales')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  if (!['picking', 'partially picked', 'picked'].includes(String(o.status).toLowerCase())) redirect(`/sales/${id}`)

  type L = { id: string; product_name: string | null; product_sku: string | null; unit: string | null; quantity_picked: number | null; sort_order: number | null }
  const lines = ([...(o.sales_order_lines ?? [])] as L[])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter(l => Number(l.quantity_picked ?? 0) > 0)
    .map(l => ({ id: l.id, name: l.product_name ?? '', sku: l.product_sku ?? '', unit: l.unit ?? 'Each', picked: Number(l.quantity_picked) }))

  const [{ data: org }, { data: cartons }] = await Promise.all([
    adminClient.from('organisations').select('default_carrier, default_shipping_method').eq('id', orgId).single(),
    adminClient
      .from('sales_order_cartons')
      .select('id, name, sort_order, sales_order_carton_lines ( so_line_id, qty )')
      .eq('so_id', id)
      .order('sort_order'),
  ])
  const orgData = (org ?? {}) as { default_carrier?: string | null; default_shipping_method?: string | null }

  type C = { id: string; name: string; sales_order_carton_lines: { so_line_id: string; qty: number }[] | null }
  const saved = ((cartons ?? []) as C[]).map(c => ({
    name: c.name,
    lines: (c.sales_order_carton_lines ?? []).map(x => ({ line_id: x.so_line_id, qty: Number(x.qty) })),
  }))

  return (
    <PackSalesOrder
      order={{ id: o.id, so_number: o.so_number ?? '', customer_name: o.customer_name ?? '' }}
      lines={lines}
      savedCartons={saved}
      carrier={o.carrier ?? orgData.default_carrier ?? 'NZ Post'}
      method={o.shipping_method ?? orgData.default_shipping_method ?? 'Standard Courier'}
      service={o.service_type ?? ''}
      tracking={o.tracking_number ?? ''}
    />
  )
}
