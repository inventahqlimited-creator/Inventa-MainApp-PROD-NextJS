import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EditPurchaseOrder from '@/components/app/edit-purchase-order'

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Fetch the PO with its lines and cost_lines
  const { data: order } = await adminClient
    .from('purchase_orders')
    .select(`
      id, po_number, status, supplier_id, supplier_name,
      location_id, location_name, order_date, expected_date,
      terms, notes, reference, currency, total_amount,
      order_discount, order_discount_type, order_discount_amount,
      purchase_order_lines (
        id, product_id, product_name, product_sku, unit,
        quantity_ordered, unit_cost, discount, tax_rate, line_notes, sort_order
      ),
      purchase_order_cost_lines (
        id, product_id, product_name, product_sku,
        description, amount, tax_rate, sort_order
      )
    `)
    .eq('id', id)
    .eq('org_id', m.org_id)
    .single()

  if (!order) redirect('/purchases')

  const [{ data: locations }, { data: contacts }, { data: products }, { data: org }] = await Promise.all([
    adminClient.from('locations').select('id, name, street, city, state, postcode, country, phone, email').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('contacts').select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency, price_level_id').eq('org_id', m.org_id).eq('type', 'supplier').eq('active', true).order('name'),
    adminClient.from('products').select('id, name, sku, buy_uom, cost_price, tax_rate, description, track_stock, type').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('organisations').select('po_default_payment_terms').eq('id', m.org_id).single(),
  ])

  // Shape the order
  const o = order as any
  const shaped = {
    ...o,
    lines: (o.purchase_order_lines ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    cost_lines: (o.purchase_order_cost_lines ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }

  return (
    <EditPurchaseOrder
      orgId={m.org_id}
      order={shaped}
      suppliers={(contacts ?? []) as any}
      locations={(locations ?? []) as any}
      products={(products ?? []) as any}
      defaultTerms={(org as any)?.po_default_payment_terms ?? null}
    />
  )
}
