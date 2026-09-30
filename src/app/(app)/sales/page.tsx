// src/app/(app)/sales/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SalesTable from '@/components/app/sales-table'

type Line = { product_id: string | null; quantity: number | null }
type Row = {
  id: string; status: string; location_id: string | null
  sales_order_lines: Line[] | null
  [k: string]: unknown
}

export default async function SalesPage() {
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

  const [{ data: orders }, { data: contacts }, { data: locations }, { data: stock }, { data: products }] = await Promise.all([
    adminClient
      .from('sales_orders')
      .select('id, so_number, status, order_date, expected_date, total_amount, customer_id, customer_name, location_id, location_name, notes, ref, terms, currency, sales_order_lines(product_id, quantity)')
      .eq('org_id', m.org_id)
      .order('created_at', { ascending: false }),
    adminClient.from('contacts').select('id, name').eq('org_id', m.org_id).eq('type', 'customer').eq('is_active', true).order('name'),
    adminClient.from('locations').select('id, name').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity').eq('org_id', m.org_id),
    adminClient.from('products').select('id, track_stock').eq('org_id', m.org_id),
  ])

  // On hand per product per location, and per product overall
  const byLoc = new Map<string, number>()
  const byProduct = new Map<string, number>()
  for (const s of (stock ?? []) as { product_id: string; location_id: string | null; quantity: number | null }[]) {
    const q = Number(s.quantity ?? 0)
    byLoc.set(`${s.product_id}|${s.location_id}`, (byLoc.get(`${s.product_id}|${s.location_id}`) ?? 0) + q)
    byProduct.set(s.product_id, (byProduct.get(s.product_id) ?? 0) + q)
  }
  const untracked = new Set(((products ?? []) as { id: string; track_stock: boolean | null }[]).filter(p => p.track_stock === false).map(p => p.id))

  // "No Stock" when the ship-from location holds less than the order needs of at least one stocked item
  const shaped = ((orders ?? []) as unknown as Row[]).map(o => {
    const { sales_order_lines, ...rest } = o
    const need = new Map<string, number>()
    for (const l of sales_order_lines ?? []) {
      if (!l.product_id || untracked.has(l.product_id)) continue
      need.set(l.product_id, (need.get(l.product_id) ?? 0) + Number(l.quantity ?? 0))
    }
    let stock_status: 'in' | 'no' | null = null
    if (need.size > 0) {
      const onHand = (pid: string) => o.location_id ? (byLoc.get(`${pid}|${o.location_id}`) ?? 0) : (byProduct.get(pid) ?? 0)
      stock_status = [...need].some(([pid, qty]) => onHand(pid) < qty) ? 'no' : 'in'
    }
    return { ...rest, stock_status }
  })

  return (
    <SalesTable
      orgId={m.org_id}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders={shaped as any}
      contacts={(contacts ?? []) as { id: string; name: string }[]}
      locations={(locations ?? []) as { id: string; name: string }[]}
    />
  )
}
