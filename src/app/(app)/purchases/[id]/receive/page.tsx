// src/app/(app)/purchases/[id]/receive/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ViewPurchaseOrder from '@/components/app/view-purchase-order'

export default async function ReceivePurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: po } = await adminClient
    .from('purchase_orders')
    .select(`
      id, po_number, ref, reference, status, supplier_id, supplier_name, location_id, location_name,
      order_date, expected_date, received_date, notes, total_amount, terms, currency,
      order_discount, order_discount_type, order_discount_amount,
      purchase_order_lines (
        id, product_id, product_name, product_sku, unit, quantity_ordered, quantity_received,
        unit_cost, total_cost, discount, tax_rate, tax_name, line_notes, batch_num, expiry_date, sort_order,
        products ( serial_tracking, batch_tracking, expiry_tracking )
      ),
      purchase_order_cost_lines (
        id, product_id, product_name, product_sku, description, amount, tax_rate, tax_name, sort_order
      )
    `)
    .eq('id', id)
    .eq('org_id', m.org_id)
    .single()

  if (!po) redirect('/purchases')

  // Only Open / Partially Received orders can be received — otherwise go back to the order
  const status = String((po as { status: string }).status).toLowerCase()
  if (!['open', 'partially received'].includes(status)) redirect(`/purchases/${id}`)

  const [{ data: contacts }, { data: locations }, { data: org }] = await Promise.all([
    adminClient.from('contacts').select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency').eq('org_id', m.org_id).eq('type', 'supplier'),
    adminClient.from('locations').select('id, name').eq('org_id', m.org_id),
    adminClient.from('organisations').select('serial_tracking, batch_tracking, expiry_tracking').eq('id', m.org_id).single(),
  ])

  // Tracking applies only when switched on for both the product and the organisation
  const orgT = (org ?? {}) as { serial_tracking?: boolean | null; batch_tracking?: boolean | null; expiry_tracking?: boolean | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = po as any
  const lines = (raw.purchase_order_lines ?? [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(({ products, ...l }: any) => ({
      ...l,
      quantity_ordered: Number(l.quantity_ordered) || 0,
      quantity_received: Number(l.quantity_received) || 0,
      unit_cost: Number(l.unit_cost) || 0,
      discount: l.discount != null ? Number(l.discount) : null,
      tax_rate: l.tax_rate != null ? Number(l.tax_rate) : null,
      serial_tracking: !!products?.serial_tracking && orgT.serial_tracking !== false,
      batch_tracking: !!products?.batch_tracking && orgT.batch_tracking !== false,
      expiry_tracking: !!products?.expiry_tracking && orgT.expiry_tracking !== false,
    }))
  const costLines = (raw.purchase_order_cost_lines ?? [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => ({ ...c, amount: Number(c.amount) || 0, tax_rate: c.tax_rate != null ? Number(c.tax_rate) : null }))

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { purchase_order_lines, purchase_order_cost_lines, ...header } = raw

  return (
    <ViewPurchaseOrder
      po={header}
      lines={lines}
      costLines={costLines}
      contacts={(contacts ?? []) as Parameters<typeof ViewPurchaseOrder>[0]['contacts']}
      locations={(locations ?? []) as { id: string; name: string }[]}
      orgId={m.org_id}
      startInReceive
      returnTo={`/purchases/${id}`}
    />
  )
}
