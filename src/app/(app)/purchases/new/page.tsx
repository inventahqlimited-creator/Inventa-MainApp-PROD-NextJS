import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewPurchaseOrder from '@/components/app/new-purchase-order'

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ from_so?: string; scope?: string; clone?: string }> }) {
  const { from_so, scope, clone } = await searchParams
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

  const [{ data: locations }, { data: contacts }, { data: products }, { data: org }, { data: taxRates }, { data: stockLevels }] = await Promise.all([
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
      .select('id, name, sku, buy_uom, cost_price, tax_rate, buy_tax_rate_id, description, track_stock, type')
      .eq('org_id', m.org_id)
      .eq('is_active', true)
      .order('name'),
    adminClient
      .from('organisations')
      .select('po_default_payment_terms, decimal_places')
      .eq('id', m.org_id)
      .single(),
    adminClient
      .from('tax_rates')
      .select('id, name, rate, is_default')
      .eq('org_id', m.org_id)
      .order('name'),
    adminClient
      .from('stock_levels')
      .select('product_id, location_id, quantity, committed')
      .eq('org_id', m.org_id),
  ])

  // Create Purchase Order from a sales order: all stocked items, or only the ones the ship-from location can't cover
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prefill: any = null
  if (from_so) {
    const { data: so } = await adminClient
      .from('sales_orders')
      .select('so_number, location_id, sales_order_lines ( product_id, quantity )')
      .eq('id', from_so)
      .eq('org_id', m.org_id)
      .single()
    if (so) {
      const s = so as unknown as { so_number: string | null; location_id: string | null; sales_order_lines: { product_id: string | null; quantity: number | null }[] | null }
      const prods = new Map(((products ?? []) as { id: string; track_stock: boolean | null; type: string }[]).map(p => [p.id, p]))
      const need = new Map<string, number>()
      for (const l of s.sales_order_lines ?? []) {
        const p = l.product_id ? prods.get(l.product_id) : undefined
        if (!l.product_id || !p || p.type === 'Service' || p.track_stock === false) continue
        need.set(l.product_id, (need.get(l.product_id) ?? 0) + Number(l.quantity ?? 0))
      }
      const onHand = (pid: string) =>
        ((stockLevels ?? []) as { product_id: string; location_id: string; quantity: number }[])
          .filter(x => x.product_id === pid && (!s.location_id || x.location_id === s.location_id))
          .reduce((t, x) => t + Number(x.quantity || 0), 0)
      const lines = [...need]
        .filter(([pid, qty]) => qty > 0 && (scope === 'short' ? onHand(pid) < qty : true))
        .map(([product_id, quantity]) => ({ product_id, quantity }))
      prefill = { location_id: s.location_id, notes: `Created from sales order ${s.so_number ?? ''}`.trim(), lines, source_so_id: from_so }
    }
  }

  // Clone Order — a new order pre-filled from an existing one (supplier, lines, costs, discount, terms, notes)
  if (clone) {
    const { data: src } = await adminClient
      .from('purchase_orders')
      .select(`
        supplier_id, location_id, terms, ref, reference, notes, order_discount, order_discount_type,
        purchase_order_lines ( product_id, unit, quantity_ordered, unit_cost, discount, tax_rate, tax_rate_id, tax_name, line_notes, sort_order ),
        purchase_order_cost_lines ( product_id, product_name, product_sku, description, amount, tax_rate, tax_rate_id, tax_name, sort_order )
      `)
      .eq('id', clone)
      .eq('org_id', m.org_id)
      .single()
    if (src) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = src as any
      const bySort = (a: { sort_order: number | null }, b: { sort_order: number | null }) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      prefill = {
        location_id: s.location_id, supplier_id: s.supplier_id, terms: s.terms, ref: s.ref ?? s.reference ?? null, notes: s.notes ?? '',
        order_discount: s.order_discount, order_discount_type: s.order_discount_type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lines: [...(s.purchase_order_lines ?? [])].sort(bySort).map((l: any) => ({
          product_id: l.product_id, quantity: Number(l.quantity_ordered) || 0, unit: l.unit, unit_cost: Number(l.unit_cost) || 0,
          discount: Number(l.discount) || 0, tax_rate: Number(l.tax_rate) || 0, tax_rate_id: l.tax_rate_id, tax_name: l.tax_name, line_notes: l.line_notes,
        })),
        cost_lines: [...(s.purchase_order_cost_lines ?? [])].sort(bySort),
      }
    }
  }

  const orgData = org as { po_default_payment_terms: string | null; decimal_places: number | null } | null

  return (
    <NewPurchaseOrder
      orgId={m.org_id}
      prefill={prefill}
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
        tax_rate: string | number | null
        buy_tax_rate_id: string | null
        description: string | null
        track_stock: boolean | null
        type: string
      }[]}
      defaultTerms={orgData?.po_default_payment_terms ?? null}
      decimalPlaces={orgData?.decimal_places ?? 2}
      stockLevels={(stockLevels ?? []) as { product_id: string; location_id: string; quantity: number; committed: number }[]}
      taxRates={(taxRates ?? []) as { id: string; name: string; rate: number; is_default: boolean | null }[]}
    />
  )
}
