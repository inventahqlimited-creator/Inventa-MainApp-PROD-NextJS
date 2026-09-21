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

  const [{ data: locations }, { data: products }, { data: stockLevels }, { data: org }] = await Promise.all([
    adminClient.from('locations').select('id, name').eq('org_id', m.org_id).order('name'),
    adminClient.from('products').select('id, name, sku, sell_uom, track_stock, type, serial_tracking, batch_tracking, expiry_tracking').eq('org_id', m.org_id).order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity').eq('org_id', m.org_id),
    adminClient.from('organisations').select('serial_tracking, batch_tracking, expiry_tracking').eq('id', m.org_id).single(),
  ])

  const o = (org ?? {}) as { serial_tracking?: boolean; batch_tracking?: boolean; expiry_tracking?: boolean }
  const prods = (products ?? []) as { serial_tracking: boolean | null; batch_tracking: boolean | null; expiry_tracking: boolean | null }[]
  const trackingFlags = {
    showSerial: o.serial_tracking === true || prods.some(p => p.serial_tracking),
    showBatch:  o.batch_tracking  === true || prods.some(p => p.batch_tracking),
    showExpiry: o.expiry_tracking === true || prods.some(p => p.expiry_tracking),
  }

  return (
    <NewAdjustment
      orgId={m.org_id}
      locations={(locations ?? []) as { id: string; name: string }[]}
      products={(products ?? []) as { id: string; name: string; sku: string | null; sell_uom: string | null; track_stock: boolean | null; type: string; serial_tracking: boolean | null; batch_tracking: boolean | null; expiry_tracking: boolean | null }[]}
      stockLevels={(stockLevels ?? []) as { product_id: string; location_id: string; quantity: number }[]}
      trackingFlags={trackingFlags}
    />
  )
}
