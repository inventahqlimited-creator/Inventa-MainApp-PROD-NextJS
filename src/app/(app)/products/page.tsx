// src/app/(app)/products/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProductsTable from '@/components/app/products-table'
import { loadXeroTableInfo } from '@/lib/xero/table-info'
import { hasAddon } from '@/lib/addons-server'
import { loadKitSettings } from '@/lib/kits/settings-server'

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

  const [
    { data: products },
    { data: stockLevels },
    { data: locations },
    { data: suppliers },
    { data: taxRates },
    { data: uoms },
    { data: priceLevels },
    { data: customFields },
    { data: customLists },
    { data: customListOptions },
    { data: org },
    xero,
  ] = await Promise.all([
    adminClient.from('products').select('*').eq('org_id', m.org_id).order('name'),
    adminClient.from('stock_levels').select('*').eq('org_id', m.org_id),
    adminClient.from('locations').select('id, name').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('contacts').select('id, name').eq('org_id', m.org_id).eq('type', 'supplier').order('name'),
    adminClient.from('tax_rates').select('id, name, rate, is_default').eq('org_id', m.org_id).order('name'),
    adminClient.from('uoms').select('id, name, abbr').eq('org_id', m.org_id).order('sort_order').order('created_at'),
    adminClient.from('price_levels').select('id, name, is_default').eq('org_id', m.org_id).order('name'),
    adminClient.from('product_custom_fields').select('id, name, field_type').eq('org_id', m.org_id).order('sort_order').order('created_at'),
    adminClient.from('product_custom_lists').select('id, name').eq('org_id', m.org_id).order('sort_order').order('created_at'),
    adminClient.from('product_custom_list_options').select('id, list_id, value').eq('org_id', m.org_id).order('sort_order').order('created_at'),
    adminClient.from('organisations').select('decimal_places, serial_tracking, batch_tracking, expiry_tracking').eq('id', m.org_id).single(),
    loadXeroTableInfo(adminClient, m.org_id, 'product', m.role === 'admin'),
  ])

  // Kits & Bundles: virtual stock (how many kits the items on hand could make) when the add-on and the setting are on
  let virtualBoms: Record<string, { component_id: string; quantity: number }[]> | undefined
  if (await hasAddon(adminClient, m.org_id, 'kits') && (await loadKitSettings(adminClient, m.org_id)).show_virtual_stock) {
    const { data: bom } = await adminClient.from('product_bom_lines').select('kit_id, component_id, quantity').eq('org_id', m.org_id)
    virtualBoms = {}
    for (const r of (bom ?? []) as { kit_id: string; component_id: string; quantity: number }[]) (virtualBoms[r.kit_id] ??= []).push({ component_id: r.component_id, quantity: Number(r.quantity) })
  }

  const customListsWithOptions = (customLists ?? []).map((l: Record<string, unknown>) => ({
    ...(l as { id: string; name: string }),
    options: (customListOptions ?? [])
      .filter((o: Record<string, unknown>) => o.list_id === l.id)
      .map((o: Record<string, unknown>) => ({ id: o.id as string, value: o.value as string })),
  }))

  const orgData = org as { decimal_places?: number; serial_tracking?: boolean; batch_tracking?: boolean; expiry_tracking?: boolean } | null

  return (
    <ProductsTable
      products={(products ?? []) as Parameters<typeof ProductsTable>[0]['products']}
      stockLevels={(stockLevels ?? []) as Parameters<typeof ProductsTable>[0]['stockLevels']}
      locations={(locations ?? []) as { id: string; name: string }[]}
      orgId={m.org_id}
      isAdmin={m.role === 'admin'}
      suppliers={(suppliers ?? []) as { id: string; name: string }[]}
      taxRates={(taxRates ?? []) as { id: string; name: string; rate: number; is_default?: boolean }[]}
      uoms={(uoms ?? []) as { id: string; name: string; abbr?: string }[]}
      priceLevels={(priceLevels ?? []) as { id: string; name: string; is_default?: boolean }[]}
      decimalPlaces={orgData?.decimal_places ?? 2}
      orgSettings={{
        serial_tracking: orgData?.serial_tracking ?? false,
        batch_tracking: orgData?.batch_tracking ?? false,
        expiry_tracking: orgData?.expiry_tracking ?? false,
      }}
      customFields={(customFields ?? []) as { id: string; name: string; field_type: string }[]}
      customLists={customListsWithOptions}
      xero={xero}
      virtualBoms={virtualBoms}
    />
  )
}
