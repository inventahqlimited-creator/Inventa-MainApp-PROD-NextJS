// src/app/(app)/sales/[id]/pick/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PickSalesOrder from '@/components/app/pick-sales-order'
import { loadPickData, PICK_ANY } from '@/lib/sales-pick-data'

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

  const data = await loadPickData(adminClient, orgId, [id], PICK_ANY)
  if (data.orders.length === 0) redirect(`/sales/${id}`)

  return <PickSalesOrder {...data} />
}
