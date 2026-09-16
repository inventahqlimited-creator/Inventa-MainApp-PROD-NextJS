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

  const [{ data: org }, { data: locations }, { data: taxRates }, { data: currencies }] = await Promise.all([
    adminClient.from('organisations').select('*').eq('id', m.org_id).single(),
    adminClient.from('locations').select('*').eq('org_id', m.org_id).order('name'),
    adminClient.from('tax_rates').select('*').eq('org_id', m.org_id).order('name'),
    adminClient.from('currencies').select('*').eq('org_id', m.org_id).order('code'),
  ])

  return (
    <SettingsClient
      org={org ?? {}}
      locations={locations ?? []}
      taxRates={taxRates ?? []}
      currencies={currencies ?? []}
      orgId={m.org_id}
      isAdmin={m.role === 'admin'}
      initialTab={tab ?? 'general'}
    />
  )
}
