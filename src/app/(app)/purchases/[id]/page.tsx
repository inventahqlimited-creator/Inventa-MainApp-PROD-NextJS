import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EditPurchaseOrder from '@/components/app/edit-purchase-order'
import { relatedSalesOrders } from '@/lib/related'
import { loadXeroTableInfo } from '@/lib/xero/table-info'

export default async function EditPurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params
  const { edit } = await searchParams
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
        quantity_ordered, quantity_received, unit_cost, discount, tax_rate, tax_rate_id, tax_name, line_notes, sort_order
      ),
      purchase_order_cost_lines (
        id, product_id, product_name, product_sku,
        description, amount, tax_rate, tax_rate_id, tax_name, sort_order
      )
    `)
    .eq('id', id)
    .eq('org_id', m.org_id)
    .single()

  if (!order) redirect('/purchases')
  const relatedSoId = (await relatedSalesOrders(adminClient, m.org_id, [id])).get(id) ?? null

  const [{ data: locations }, { data: contacts }, { data: products }, { data: org }, { data: taxRates }, { data: stockLevels }] = await Promise.all([
    adminClient.from('locations').select('id, name, address, city, country, phone, email').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('contacts').select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency, price_level_id').eq('org_id', m.org_id).eq('type', 'supplier').eq('is_active', true).order('name'),
    adminClient.from('products').select('id, name, sku, buy_uom, cost_price, tax_rate, buy_tax_rate_id, description, track_stock, type').eq('org_id', m.org_id).eq('is_active', true).order('name'),
    adminClient.from('organisations').select('po_default_payment_terms, decimal_places').eq('id', m.org_id).single(),
    adminClient.from('tax_rates').select('id, name, rate, is_default').eq('org_id', m.org_id).order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity, committed').eq('org_id', m.org_id),
  ])

  // Shape the order
  const o = order as any
  const shaped = {
    ...o,
    lines: (o.purchase_order_lines ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    cost_lines: (o.purchase_order_cost_lines ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }

  const xero = await loadXeroTableInfo(adminClient, m.org_id, 'bill', m.role === 'admin')
  const realLines = (shaped.lines as { quantity_ordered: number | null; quantity_received: number | null }[]).filter(l => Number(l.quantity_ordered) > 0)
  const billReady = String(o.status).toLowerCase() === 'closed' && realLines.length > 0 && realLines.every(l => Number(l.quantity_received ?? 0) + 1e-9 >= Number(l.quantity_ordered))

  return (
    <EditPurchaseOrder
      orgId={m.org_id}
      order={shaped}
      relatedSoId={relatedSoId}
      suppliers={(contacts ?? []) as any}
      locations={(locations ?? []) as any}
      products={(products ?? []) as any}
      defaultTerms={(org as any)?.po_default_payment_terms ?? null}
      decimalPlaces={(org as any)?.decimal_places ?? 2}
      stockLevels={(stockLevels ?? []) as any}
      taxRates={(taxRates ?? []) as any}
      xeroBill={{ show: xero.show, canPost: xero.canPost, ready: billReady, info: xero.records[id] ?? null }}
      startInEdit={edit === '1'}
    />
  )
}
