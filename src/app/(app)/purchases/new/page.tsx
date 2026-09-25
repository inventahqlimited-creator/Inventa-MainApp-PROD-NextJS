import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewPurchaseOrder from '@/components/app/new-purchase-order'

export default async function NewPurchaseOrderPage() {
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

  const [{ data: locations }, { data: contacts }, { data: products }, { data: org }] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, address, city, country, phone, email')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
    adminClient
      .from('contacts')
      .select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency')
      .eq('org_id', m.org_id)
      .eq('type', 'supplier')
      .eq('is_active', true)
      .order('name'),
    adminClient
      .from('products')
      .select('id, name, sku, buy_uom, cost_price, tax_rate, description, track_stock, type')
      .eq('org_id', m.org_id)
      .eq('active', true)
      .order('name'),
    adminClient
      .from('organisations')
      .select('po_default_payment_terms')
      .eq('id', m.org_id)
      .single(),
  ])

  const orgData = org as { po_default_payment_terms: string | null } | null

  return (
    <NewPurchaseOrder
      orgId={m.org_id}
      suppliers={(contacts ?? []) as {
        id: string
        name: string
        email: string | null
        phone: string | null
        bill_street: string | null
        bill_city: string | null
        bill_country: string | null
        terms: string | null
        currency: string | null
      }[]}
      locations={(locations ?? []) as {
        id: string
        name: string
        address: string | null
        city: string | null
        country: string | null
        phone: string | null
        email: string | null
      }[]}
      products={(products ?? []) as {
        id: string
        name: string
        sku: string | null
        buy_uom: string | null
        cost_price: number | null
        tax_rate: string | null
        description: string | null
        track_stock: boolean | null
        type: string
      }[]}
      defaultTerms={orgData?.po_default_payment_terms ?? null}
    />
  )
}
