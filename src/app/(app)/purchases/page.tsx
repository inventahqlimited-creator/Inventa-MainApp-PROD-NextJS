import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PurchasesTable from '@/components/app/purchases-table'
import { relatedSalesOrders } from '@/lib/related'
import { loadXeroTableInfo } from '@/lib/xero/table-info'

export default async function PurchasesPage() {
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

  const [{ data: orders }, { data: contacts }, { data: locations }] = await Promise.all([
    adminClient
      .from('purchase_orders')
      .select('id, po_number, status, order_date, expected_date, total_amount, supplier_id, supplier_name, location_id, location_name, notes, reference, terms, currency')
      .eq('org_id', m.org_id)
      .order('created_at', { ascending: false }),
    adminClient
      .from('contacts')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('type', 'supplier')
      .eq('is_active', true)
      .order('name'),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
  ])

  const relatedSo = await relatedSalesOrders(adminClient, m.org_id, ((orders ?? []) as { id: string }[]).map(o => o.id))
  const xero = await loadXeroTableInfo(adminClient, m.org_id, 'bill', m.role === 'admin')
  // Closed orders that are fully received: a bill can be posted for these
  let billReady: string[] = []
  if (xero.show) {
    const { data: closed } = await adminClient.from('purchase_orders').select('id, purchase_order_lines ( quantity_ordered, quantity_received )').eq('org_id', m.org_id).ilike('status', 'closed')
    billReady = ((closed ?? []) as { id: string; purchase_order_lines: { quantity_ordered: number | null; quantity_received: number | null }[] | null }[])
      .filter(o => {
        const real = (o.purchase_order_lines ?? []).filter(l => Number(l.quantity_ordered) > 0)
        return real.length > 0 && real.every(l => Number(l.quantity_received ?? 0) + 1e-9 >= Number(l.quantity_ordered))
      })
      .map(o => o.id)
  }
  const shaped = ((orders ?? []) as { id: string }[]).map(o => ({ ...o, related_so_id: relatedSo.get(o.id) ?? null }))

  return (
    <PurchasesTable
      orgId={m.org_id}
      xero={xero}
      billReady={billReady}
      orders={shaped as any}
      contacts={(contacts ?? []) as { id: string; name: string }[]}
      locations={(locations ?? []) as { id: string; name: string }[]}
    />
  )
}
