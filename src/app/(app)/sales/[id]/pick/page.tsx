// src/app/(app)/sales/[id]/pick/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PickSalesOrder from '@/components/app/pick-sales-order'

const PICKABLE = ['open', 'no stock', 'stock available', 'partial stock', 'picking', 'partially picked', 'picked', 'packed']

export default async function PickSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
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
      id, so_number, status, customer_name, location_id, location_name,
      sales_order_lines ( id, product_id, product_name, product_sku, unit, quantity, quantity_picked, sort_order )
    `)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()
  if (!order) redirect('/sales')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  if (!PICKABLE.includes(String(o.status).toLowerCase()) || !o.location_id) redirect(`/sales/${id}`)

  type L = { id: string; product_id: string | null; product_name: string | null; product_sku: string | null; unit: string | null; quantity: number; quantity_picked: number | null; sort_order: number | null }
  const rawLines = ([...(o.sales_order_lines ?? [])] as L[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const productIds = [...new Set(rawLines.map(l => l.product_id).filter((x): x is string => !!x))]

  const [{ data: org }, { data: products }, { data: levels }, { data: groups }, { data: bins }, { data: picks }] = await Promise.all([
    adminClient.from('organisations').select('allow_over_picking, auto_picking, picking_rule, fulfilment_mode').eq('id', orgId).single(),
    productIds.length
      ? adminClient.from('products').select('id, track_stock, type, batch_tracking, serial_tracking, expiry_tracking').in('id', productIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? adminClient.from('stock_levels').select('product_id, quantity').eq('org_id', orgId).eq('location_id', o.location_id).in('product_id', productIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? adminClient.from('stock_groups').select('id, product_id, bin_id, batch_number, serial_number, expiry_date, quantity, created_at')
          .eq('org_id', orgId).eq('location_id', o.location_id).in('product_id', productIds).gt('quantity', 0)
      : Promise.resolve({ data: [] }),
    adminClient.from('bins').select('id, name').eq('org_id', orgId).eq('location_id', o.location_id),
    // every pick on these products at this location (this order's own picks are separated below)
    productIds.length
      ? adminClient.from('sales_order_picks').select('so_id, so_line_id, product_id, stock_group_id, qty').eq('org_id', orgId).eq('location_id', o.location_id).in('product_id', productIds)
      : Promise.resolve({ data: [] }),
  ])

  type P = { id: string; track_stock: boolean | null; type: string | null; batch_tracking: boolean | null; serial_tracking: boolean | null; expiry_tracking: boolean | null }
  type G = { id: string; product_id: string; bin_id: string | null; batch_number: string | null; serial_number: string | null; expiry_date: string | null; quantity: number; created_at: string }
  type K = { so_id: string; so_line_id: string; product_id: string; stock_group_id: string | null; qty: number }
  const prodMap = new Map(((products ?? []) as P[]).map(p => [p.id, p]))
  const binName = new Map(((bins ?? []) as { id: string; name: string }[]).map(b => [b.id, b.name]))
  const onHand = new Map<string, number>()
  for (const s of (levels ?? []) as { product_id: string; quantity: number }[]) onHand.set(s.product_id, (onHand.get(s.product_id) ?? 0) + Number(s.quantity || 0))
  const allPicks = (picks ?? []) as K[]
  const othersOnGroup = new Map<string, number>()
  const othersUntracked = new Map<string, number>()
  for (const k of allPicks) {
    if (k.so_id === id) continue
    if (k.stock_group_id) othersOnGroup.set(k.stock_group_id, (othersOnGroup.get(k.stock_group_id) ?? 0) + Number(k.qty))
    else othersUntracked.set(k.product_id, (othersUntracked.get(k.product_id) ?? 0) + Number(k.qty))
  }

  const lines = rawLines
    .filter(l => {
      const p = l.product_id ? prodMap.get(l.product_id) : undefined
      return !!p && p.track_stock !== false && (p.type ?? '') !== 'Service' && Number(l.quantity) > 0
    })
    .map(l => {
      const p = prodMap.get(l.product_id as string) as P
      const gs = ((groups ?? []) as G[]).filter(g => g.product_id === l.product_id)
      const stock = gs
        .map(g => ({
          group_id: g.id,
          bin: g.bin_id ? (binName.get(g.bin_id) ?? null) : null,
          batch: g.batch_number,
          serial: g.serial_number,
          expiry: g.expiry_date,
          created_at: g.created_at,
          available: Math.max(Number(g.quantity) - (othersOnGroup.get(g.id) ?? 0), 0),
        }))
        .filter(s => s.available > 0)
      const grouped = gs.reduce((s, g) => s + Number(g.quantity), 0)
      const loose = Math.max((onHand.get(l.product_id as string) ?? 0) - grouped - (othersUntracked.get(l.product_id as string) ?? 0), 0)
      if (loose > 0) stock.push({ group_id: null as unknown as string, bin: null, batch: null, serial: null, expiry: null, created_at: '', available: loose })
      return {
        id: l.id,
        product_id: l.product_id as string,
        name: l.product_name ?? '',
        sku: l.product_sku ?? '',
        unit: l.unit ?? 'Each',
        ordered: Number(l.quantity),
        onHand: onHand.get(l.product_id as string) ?? 0,
        tracking: { batch: !!p.batch_tracking, serial: !!p.serial_tracking, expiry: !!p.expiry_tracking },
        stock,
        picks: allPicks
          .filter(k => k.so_line_id === l.id)
          .map(k => ({ group_id: k.stock_group_id, qty: Number(k.qty) })),
        // legacy orders were picked before pick details were kept
        legacyPicked: allPicks.some(k => k.so_line_id === l.id) ? 0 : Number(l.quantity_picked ?? 0),
      }
    })

  const orgData = (org ?? {}) as { allow_over_picking?: boolean | null; auto_picking?: boolean | null; picking_rule?: string | null; fulfilment_mode?: string | null }

  return (
    <PickSalesOrder
      order={{ id: o.id, so_number: o.so_number ?? '', customer_name: o.customer_name ?? '', location_name: o.location_name ?? '', status: o.status }}
      lines={lines}
      allowOverPicking={!!orgData.allow_over_picking}
      autoPicking={!!orgData.auto_picking}
      pickingRule={(orgData.picking_rule ?? 'FIFO') as 'FIFO' | 'LIFO' | 'FEFO'}
      fulfilmentMode={orgData.fulfilment_mode ?? 'full'}
    />
  )
}
