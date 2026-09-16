import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewTransfer from '@/components/app/new-transfer'

export default async function NewTransferPage() {
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

  const [{ data: locations }, { data: products }] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
    adminClient
      .from('products')
      .select('id, name, sku, sell_uom, track_stock, type')
      .eq('org_id', m.org_id)
      .eq('is_active', true)
      .eq('track_stock', true)
      .order('name'),
  ])

  return (
    <NewTransfer
      orgId={m.org_id}
      locations={locations ?? []}
      products={products ?? []}
    />
  )
}
