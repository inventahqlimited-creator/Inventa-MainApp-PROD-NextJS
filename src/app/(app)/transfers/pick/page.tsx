// src/app/(app)/transfers/pick/page.tsx
// Bulk pick — /transfers/pick?ids=a,b,c. Only Open transfers load; anything else in the selection is ignored.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PickSalesOrder from '@/components/app/pick-sales-order'
import { loadTransferPickData, TR_PICK_OPEN } from '@/lib/transfer-pick-data'

export default async function PickManyTransfersPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams
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

  const list = (ids ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) redirect('/transfers')

  const data = await loadTransferPickData(adminClient, m.org_id, list, TR_PICK_OPEN)
  if (data.orders.length === 0) redirect('/transfers')

  return <PickSalesOrder {...data} kind="transfer" />
}
