import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import EditAdjustment from '@/components/app/edit-adjustment'

export default async function EditAdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: adjustment }, { data: lines }, { data: locations }, { data: products }, { data: stockLevels }, { data: org }, { data: locationBinsData }] = await Promise.all([
    adminClient.from('adjustment_orders').select('*').eq('id', id).eq('org_id', m.org_id).single(),
    adminClient.from('adjustment_order_lines').select('*').eq('adj_id', id).eq('org_id', m.org_id).order('sort_order'),
    adminClient.from('locations').select('id, name').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('products').select('id, name, sku, sell_uom, track_stock, type, serial_tracking, batch_tracking, expiry_tracking').eq('org_id', m.org_id).order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity').eq('org_id', m.org_id),
    adminClient.from('organisations').select('serial_tracking, batch_tracking, expiry_tracking').eq('id', m.org_id).single(),
    adminClient.from('bins').select('id, name, location_id').eq('org_id', m.org_id).eq('is_active', true).order('name'),
  ])

  if (!adjustment) notFound()

  const adj = adjustment as { status: string; location_id: string | null; location_name: string | null; adjustment_date: string | null; reason: string | null; notes: string | null }
  if (adj.status !== 'Draft') redirect(`/products/adjustments/${id}`)

  const o = (org ?? {}) as { serial_tracking?: boolean; batch_tracking?: boolean; expiry_tracking?: boolean }
  const prods = (products ?? []) as { serial_tracking: boolean | null; batch_tracking: boolean | null; expiry_tracking: boolean | null }[]
  const trackingFlags = {
    showSerial: o.serial_tracking === true || prods.some(p => p.serial_tracking),
    showBatch:  o.batch_tracking  === true || prods.some(p => p.batch_tracking),
    showExpiry: o.expiry_tracking === true || prods.some(p => p.expiry_tracking),
  }

  type RawBin = { id: string; name: string; location_id: string }
  const bins = (locationBinsData ?? []) as RawBin[]

  const locationsWithBins = (locations ?? []).map((l: { id: string; name: string }) => ({
    ...l,
    bins: bins.filter(b => b.location_id === l.id).map(b => ({ id: b.id, name: b.name })),
  }))

  return (
    <EditAdjustment
      adjId={id}
      initialAdj={adj}
      initialLines={lines ?? []}
      orgId={m.org_id}
      locations={locationsWithBins}
      products={(products ?? []) as { id: string; name: string; sku: string | null; sell_uom: string | null; track_stock: boolean | null; type: string; serial_tracking: boolean | null; batch_tracking: boolean | null; expiry_tracking: boolean | null }[]}
      stockLevels={(stockLevels ?? []) as { product_id: string; location_id: string; quantity: number }[]}
      trackingFlags={trackingFlags}
    />
  )
}
