// src/app/(app)/sales/pack/page.tsx
// Bulk pack — /sales/pack?ids=a,b,c. Only orders in Picked status load; anything else in the selection is ignored.
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PackSalesOrder from '@/components/app/pack-sales-order'
import { loadPackData, PACK_BULK } from '@/lib/sales-pack-data'

export default async function PackManyPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
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

  const packs = (await loadPackData(adminClient, orgId, list, PACK_BULK)).filter(p => p.lines.length > 0)
  if (packs.length === 0) redirect('/sales')

  return <PackSalesOrder packs={packs} />
}
