// src/app/(app)/transfers/[id]/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TransferForm from '@/components/app/transfer-form'

export default async function ViewTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const [{ data: transfer }, { data: lines }, { data: locations }, { data: products }, { data: stockLevels }, { data: bins }] = await Promise.all([
    adminClient.from('transfer_orders').select('*').eq('id', id).eq('org_id', m.org_id).single(),
    adminClient.from('transfer_order_lines').select('*').eq('tr_id', id).eq('org_id', m.org_id).order('sort_order'),
    adminClient.from('locations').select('id, name, address, city, country, phone, email').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('products').select('id, name, sku, sell_uom, track_stock, type').eq('org_id', m.org_id).eq('is_active', true).eq('track_stock', true).eq('type', 'Stock').order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity, committed').eq('org_id', m.org_id),
    adminClient.from('bins').select('id, name, location_id').eq('org_id', m.org_id).order('name'),
  ])
  if (!transfer) notFound()

  return (
    <TransferForm
      orgId={m.org_id}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transfer={transfer as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines={(lines ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      locations={(locations ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products={(products ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockLevels={(stockLevels ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bins={(bins ?? []) as any}
      defaultFromId={null}
    />
  )
}
