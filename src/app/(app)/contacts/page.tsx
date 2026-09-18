// src/app/(app)/contacts/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContactsTable from '@/components/app/contacts-table'

const FULL_PERMISSIONS = {
  create_contacts: true,
  edit_contacts: true,
  export_contacts: true,
  import_contacts: true,
}

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id, role, custom_role_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) redirect('/login')
  const m = membership as { org_id: string; role: string; custom_role_id: string | null }

  // Resolve permissions: admins get everything, others look up their custom role
  let permissions = { ...FULL_PERMISSIONS }
  if (m.role !== 'admin' && m.custom_role_id) {
    const { data: roleRow } = await adminClient
      .from('org_roles')
      .select('permissions')
      .eq('id', m.custom_role_id)
      .eq('org_id', m.org_id)
      .single()
    if (roleRow?.permissions) {
      const p = roleRow.permissions as Record<string, boolean>
      permissions = {
        create_contacts: p.create_contacts ?? false,
        edit_contacts: p.edit_contacts ?? false,
        export_contacts: p.export_contacts ?? false,
        import_contacts: p.import_contacts ?? false,
      }
    }
  } else if (m.role !== 'admin') {
    // Non-admin with no custom role — no permissions
    permissions = { create_contacts: false, edit_contacts: false, export_contacts: false, import_contacts: false }
  }

  const [
    { data: contacts },
    { data: org },
    { data: priceLevels },
    { data: currencies },
    { data: taxRates },
    { data: locations },
    { data: customFields },
    { data: customLists },
    { data: customListOptions },
  ] = await Promise.all([
    adminClient.from('contacts').select('*').eq('org_id', m.org_id).order('name'),
    adminClient.from('organisations').select('base_currency').eq('id', m.org_id).single(),
    adminClient.from('price_levels').select('id, name, is_default').eq('org_id', m.org_id).order('sort_order').order('name'),
    adminClient.from('currencies').select('id, code, name, symbol').eq('org_id', m.org_id).order('code'),
    adminClient.from('tax_rates').select('id, name, rate').eq('org_id', m.org_id).order('name'),
    adminClient.from('locations').select('id, name, active').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('contact_custom_fields').select('id, name, field_type').eq('org_id', m.org_id).order('sort_order').order('created_at'),
    adminClient.from('contact_custom_lists').select('id, name').eq('org_id', m.org_id).order('sort_order').order('created_at'),
    adminClient.from('contact_custom_list_options').select('id, list_id, value').eq('org_id', m.org_id).order('sort_order').order('created_at'),
  ])

  // Attach options to their lists
  const customListsWithOptions = (customLists ?? []).map((l: Record<string, unknown>) => ({
    ...(l as { id: string; name: string }),
    options: (customListOptions ?? [])
      .filter((o: Record<string, unknown>) => o.list_id === l.id)
      .map((o: Record<string, unknown>) => ({ id: o.id as string, value: o.value as string })),
  }))

  return (
    <ContactsTable
      contacts={(contacts ?? []) as Parameters<typeof ContactsTable>[0]['contacts']}
      orgId={m.org_id}
      isAdmin={m.role === 'admin'}
      permissions={permissions}
      priceLevels={(priceLevels ?? []) as { id: string; name: string; is_default: boolean }[]}
      currencies={(currencies ?? []) as { id: string; code: string; name: string; symbol: string | null }[]}
      baseCurrency={(org as { base_currency?: string } | null)?.base_currency ?? 'NZD'}
      taxRates={(taxRates ?? []) as { id: string; name: string; rate: number }[]}
      locations={(locations ?? []) as { id: string; name: string; active: boolean }[]}
      customFields={(customFields ?? []) as { id: string; name: string; field_type: string }[]}
      customLists={customListsWithOptions}
    />
  )
}
