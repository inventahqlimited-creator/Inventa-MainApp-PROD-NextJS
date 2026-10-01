// src/app/(app)/transfers/[id]/pick/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PickSalesOrder from '@/components/app/pick-sales-order'
import { loadTransferPickData, TR_PICK_ANY } from '@/lib/transfer-pick-data'

export default async function PickTransferPage({ params }: { params: Promise<{ id: string }> }) {
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

  const data = await loadTransferPickData(adminClient, m.org_id, [id], TR_PICK_ANY)
  if (data.orders.length === 0) redirect(`/transfers/${id}`)

  return <PickSalesOrder {...data} kind="transfer" />
}
