// src/app/(app)/sales/[id]/pack/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PackSalesOrder from '@/components/app/pack-sales-order'
import { loadPackData, PACK_SINGLE } from '@/lib/sales-pack-data'

export default async function PackSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
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

  const packs = await loadPackData(adminClient, orgId, [id], PACK_SINGLE)
  if (packs.length === 0 || packs[0].lines.length === 0) redirect(`/sales/${id}`)

  return <PackSalesOrder packs={packs} />
}
