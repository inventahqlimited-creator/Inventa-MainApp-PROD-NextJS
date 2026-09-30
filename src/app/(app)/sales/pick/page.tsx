// src/app/(app)/sales/pick/page.tsx
// Bulk pick — /sales/pick?ids=a,b,c. Only Open orders load; anything else in the selection is ignored.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PickSalesOrder from '@/components/app/pick-sales-order'
import { loadPickData, PICK_OPEN } from '@/lib/sales-pick-data'

export default async function PickManyPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams
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

  const list = (ids ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) redirect('/sales')

  const data = await loadPickData(adminClient, orgId, list, PICK_OPEN)
  if (data.orders.length === 0) redirect('/sales')

  return <PickSalesOrder {...data} />
}
