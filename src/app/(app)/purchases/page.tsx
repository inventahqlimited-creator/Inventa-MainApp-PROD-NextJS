import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PurchasesTable from '@/components/app/purchases-table'
import { relatedSalesOrders } from '@/lib/related'

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
  const shaped = ((orders ?? []) as { id: string }[]).map(o => ({ ...o, related_so_id: relatedSo.get(o.id) ?? null }))

  return (
    <PurchasesTable
      orgId={m.org_id}
      orders={shaped as any}
      contacts={(contacts ?? []) as { id: string; name: string }[]}
      locations={(locations ?? []) as { id: string; name: string }[]}
    />
  )
}
