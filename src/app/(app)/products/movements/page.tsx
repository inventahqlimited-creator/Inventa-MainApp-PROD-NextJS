// src/app/(app)/products/movements/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MovementsTable from '@/components/app/movements-table'

export default async function MovementsPage() {
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

  if (!membership?.org_id) redirect('/login')
  const orgId = membership.org_id

  const [{ data: products }, { data: locations }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, name, sku')
      .eq('org_id', orgId)
      .order('name'),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name'),
  ])

  return (
    <MovementsTable
      orgId={orgId}
      products={products ?? []}
      locations={locations ?? []}
    />
  )
}
