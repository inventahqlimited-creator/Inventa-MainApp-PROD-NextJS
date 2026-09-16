import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ViewAdjustment from '@/components/app/view-adjustment'

export default async function ViewAdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: adjustment }, { data: lines }] = await Promise.all([
    adminClient.from('adjustment_orders').select('*').eq('id', id).eq('org_id', m.org_id).single(),
    adminClient.from('adjustment_order_lines').select('*').eq('adj_id', id).eq('org_id', m.org_id).order('sort_order'),
  ])

  if (!adjustment) notFound()

  return <ViewAdjustment adjustment={adjustment} lines={lines ?? []} orgId={m.org_id} />
}
