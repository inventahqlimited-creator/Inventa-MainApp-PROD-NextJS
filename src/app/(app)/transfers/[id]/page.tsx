import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ViewTransfer from '@/components/app/view-transfer'

export default async function ViewTransferPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: transfer }, { data: lines }, { data: locations }] = await Promise.all([
    adminClient.from('transfer_orders').select('*').eq('id', id).eq('org_id', m.org_id).single(),
    adminClient.from('transfer_order_lines').select('*').eq('tr_id', id).eq('org_id', m.org_id).order('sort_order'),
    adminClient.from('locations').select('id, name').eq('org_id', m.org_id).eq('active', true).order('name'),
  ])

  if (!transfer) notFound()

  return (
    <ViewTransfer
      transfer={transfer}
      lines={lines ?? []}
      locations={locations ?? []}
      orgId={m.org_id}
    />
  )
}
