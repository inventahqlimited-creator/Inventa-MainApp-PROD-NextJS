// src/app/(app)/transfers/new/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TransferForm from '@/components/app/transfer-form'
import { loadKitColumns, loadKitScreenData } from '@/lib/kits/order-lines-server'

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ clone?: string }> }) {
  const { clone } = await searchParams
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

  const [{ data: locations }, { data: products }, { data: stockLevels }, { data: bins }, { data: org }] = await Promise.all([
    adminClient.from('locations').select('id, name, address, city, country, phone, email').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('products').select('id, name, sku, sell_uom, track_stock, type').eq('org_id', m.org_id).eq('is_active', true).eq('track_stock', true).eq('type', 'Stock').order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity, committed').eq('org_id', m.org_id),
    adminClient.from('bins').select('id, name, location_id').eq('org_id', m.org_id).order('name'),
    adminClient.from('organisations').select('so_default_ship_from').eq('id', m.org_id).single(),
  ])

  // Clone Order: copy another transfer's locations, notes and items
  let cloneOf: { from_location_id: string | null; to_location_id: string | null; notes: string | null } | null = null
  let cloneLines: unknown[] = []
  if (clone && /^[0-9a-f-]{36}$/i.test(clone)) {
    const [{ data: src }, { data: srcLines }] = await Promise.all([
      adminClient.from('transfer_orders').select('from_location_id, to_location_id, notes').eq('id', clone).eq('org_id', m.org_id).maybeSingle(),
      adminClient.from('transfer_order_lines').select('*').eq('tr_id', clone).eq('org_id', m.org_id).order('sort_order'),
    ])
    if (src) {
      cloneOf = src as typeof cloneOf
      const kc = await loadKitColumns(adminClient, m.org_id, clone, 'transfer')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cloneLines = ((srcLines ?? []) as any[]).map(l => { const k = kc.get(l.id); return k ? { ...l, kit_group: k.kit_group, is_kit_parent: k.is_kit_parent, kit_qty_per: k.kit_qty_per, quantity: k.is_kit_parent ? (k.kit_qty ?? 0) : l.quantity } : l })
    }
  }

  // Kits & Bundles: kits can be transferred too (they are not stock items themselves, so they are added to the list here)
  const kits = await loadKitScreenData(adminClient, m.org_id)
  const kitIds = kits.enabled ? Object.keys(kits.catalog) : []
  const kitProducts = kitIds.length ? ((await adminClient.from('products').select('id, name, sku, sell_uom, track_stock, type').eq('org_id', m.org_id).eq('is_active', true).in('id', kitIds)).data ?? []) : []
  const allProducts = [...(products ?? []), ...kitProducts].sort((a, b) => String(a.name).localeCompare(String(b.name)))

  return (
    <TransferForm
      orgId={m.org_id}
      transfer={null}
      cloneOf={cloneOf}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines={cloneLines as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      locations={(locations ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products={allProducts as any}
      kits={kits}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockLevels={(stockLevels ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bins={(bins ?? []) as any}
      defaultFromId={(org as { so_default_ship_from?: string | null } | null)?.so_default_ship_from ?? null}
    />
  )
}
