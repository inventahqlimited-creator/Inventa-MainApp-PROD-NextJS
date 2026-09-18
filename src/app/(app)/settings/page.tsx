import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsClient from '@/components/app/settings-client'

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
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

  const [
    { data: org },
    { data: locations },
    { data: taxRates },
    { data: currencies },
    { data: bins },
    { data: membersRaw },
    { count: salesCount },
    { count: purchaseCount },
    { count: transferCount },
    { count: adjustmentCount },
  ] = await Promise.all([
    adminClient.from('organisations').select('*').eq('id', m.org_id).single(),
    adminClient.from('locations').select('*').eq('org_id', m.org_id).order('name'),
    adminClient.from('tax_rates').select('*').eq('org_id', m.org_id).order('name'),
    adminClient.from('currencies').select('*').eq('org_id', m.org_id).order('code'),
    adminClient.from('bins').select('*').eq('org_id', m.org_id).eq('is_active', true).order('name'),
    adminClient.from('org_members').select('id, first_name, last_name, email, role, invite_status, accepted_at, user_id').eq('org_id', m.org_id).order('accepted_at', { ascending: true }),
    adminClient.from('sales_orders').select('*', { count: 'exact', head: true }).eq('org_id', m.org_id).limit(1),
    adminClient.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('org_id', m.org_id).limit(1),
    adminClient.from('stock_transfers').select('*', { count: 'exact', head: true }).eq('org_id', m.org_id).limit(1),
    adminClient.from('stock_adjustments').select('*', { count: 'exact', head: true }).eq('org_id', m.org_id).limit(1),
  ])

  // Fetch last_sign_in_at from auth.users for accepted members
  const acceptedUserIds = (membersRaw ?? [])
    .filter((mb: Record<string, unknown>) => mb.invite_status === 'accepted' && mb.user_id)
    .map((mb: Record<string, unknown>) => mb.user_id as string)

  let lastSignInMap: Record<string, string | null> = {}
  if (acceptedUserIds.length > 0) {
    const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 200 })
    lastSignInMap = Object.fromEntries(
      (authUsers ?? [])
        .filter(u => acceptedUserIds.includes(u.id))
        .map(u => [u.id, u.last_sign_in_at ?? null])
    )
  }

  const members = (membersRaw ?? []).map((mb: Record<string, unknown>) => ({
    ...mb,
    last_sign_in_at: lastSignInMap[mb.user_id as string] ?? null,
    is_me: mb.user_id === user.id,
  }))

  const hasTxns = (salesCount ?? 0) > 0 || (purchaseCount ?? 0) > 0 || (transferCount ?? 0) > 0 || (adjustmentCount ?? 0) > 0

  // Attach bins to their locations
  const locationsWithBins = (locations ?? []).map((loc: Record<string, unknown>) => ({
    ...loc,
    bins: (bins ?? []).filter((b: Record<string, unknown>) => b.location_id === loc.id),
  }))

  return (
    <SettingsClient
      org={org ?? {}}
      locations={locationsWithBins}
      taxRates={taxRates ?? []}
      currencies={currencies ?? []}
      orgId={m.org_id}
      isAdmin={m.role === 'admin'}
      initialTab={tab ?? 'general'}
      hasTxns={hasTxns}
      members={members}
    />
  )
}
