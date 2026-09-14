import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContactsTable from '@/components/app/contacts-table'

export default async function ContactsPage() {
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

  const { data: contacts } = await adminClient
    .from('contacts')
    .select('id, name, type, email, phone, bill_street, bill_city, bill_postcode, bill_country, ship_name, ship_street, ship_city, ship_postcode, ship_country, currency, tier, terms, tax_rate, balance_owing, credit_limit, disc_type, disc_value, tax_number, website, notes, is_active, status')
    .eq('org_id', m.org_id)
    .order('name', { ascending: true })

  return (
    <ContactsTable
      contacts={contacts ?? []}
      orgId={m.org_id}
      isAdmin={m.role === 'admin'}
    />
  )
}
