import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ViewPurchaseOrder from '@/components/app/view-purchase-order'

export default async function ViewPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: po }, { data: lines }, { data: contacts }, { data: locations }] = await Promise.all([
    adminClient
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('org_id', m.org_id)
      .single(),
    adminClient
      .from('purchase_order_lines')
      .select('*')
      .eq('po_id', id)
      .eq('org_id', m.org_id)
      .order('sort_order'),
    adminClient
      .from('contacts')
      .select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency')
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

  if (!po) notFound()

  return (
    <ViewPurchaseOrder
      po={po}
      lines={lines ?? []}
      contacts={contacts ?? []}
      locations={locations ?? []}
      orgId={m.org_id}
    />
  )
}
