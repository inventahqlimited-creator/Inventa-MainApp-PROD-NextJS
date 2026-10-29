// src/app/(app)/transfers/[id]/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TransferForm from '@/components/app/transfer-form'
import { loadKitColumns, loadKitScreenData } from '@/lib/kits/order-lines-server'

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

  // Kits & Bundles: kits can be transferred too (they are not stock items themselves, so they are added to the list here)
  const kits = await loadKitScreenData(adminClient, m.org_id)
  const kitIds = kits.enabled ? Object.keys(kits.catalog) : []
  const kitProducts = kitIds.length ? ((await adminClient.from('products').select('id, name, sku, sell_uom, track_stock, type').eq('org_id', m.org_id).eq('is_active', true).in('id', kitIds)).data ?? []) : []
  const allProducts = [...(products ?? []), ...kitProducts].sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const kc = await loadKitColumns(adminClient, m.org_id, id, 'transfer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineList = ((lines ?? []) as any[]).map(l => { const k = kc.get(l.id); return k ? { ...l, kit_group: k.kit_group, is_kit_parent: k.is_kit_parent, kit_qty_per: k.kit_qty_per, quantity: k.is_kit_parent ? (k.kit_qty ?? 0) : l.quantity } : l })

  return (
    <TransferForm
      orgId={m.org_id}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transfer={transfer as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines={lineList as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      locations={(locations ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products={allProducts as any}
      kits={kits}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockLevels={(stockLevels ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bins={(bins ?? []) as any}
      defaultFromId={null}
    />
  )
}
