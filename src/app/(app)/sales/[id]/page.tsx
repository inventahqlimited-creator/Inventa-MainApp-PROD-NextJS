// src/app/(app)/sales/[id]/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SalesOrderForm from '@/components/app/sales-order-form'
import { relatedPurchaseOrders } from '@/lib/related'
import { loadXeroTableInfo } from '@/lib/xero/table-info'

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: order } = await adminClient
    .from('sales_orders')
    .select(`
      id, so_number, status, customer_id, customer_name, location_id, location_name,
      order_date, expected_date, terms, notes, ref, currency, price_level_id, total_amount,
      order_discount, order_discount_type, order_discount_amount,
      sales_order_lines (
        id, product_id, product_name, product_sku, unit, quantity, quantity_picked, quantity_packed,
        unit_price, discount, tax_rate, tax_rate_id, tax_name, line_notes, sort_order
      ),
      sales_order_cost_lines (
        id, product_id, product_name, product_sku, description, amount, tax_rate, tax_rate_id, tax_name, sort_order
      )
    `)
    .eq('id', id)
    .eq('org_id', m.org_id)
    .single()

  if (!order) redirect('/sales')
  const relatedPoId = (await relatedPurchaseOrders(adminClient, m.org_id, [id])).get(id) ?? null
  const xeroInfo = await loadXeroTableInfo(adminClient, m.org_id, 'invoice', m.role === 'admin')

  const [
    { data: locations }, { data: customers }, { data: products }, { data: org },
    { data: taxRates }, { data: stockLevels }, { data: priceLevels }, { data: currencies },
    { data: prices }, { data: pricing },
  ] = await Promise.all([
    adminClient.from('locations').select('id, name, address, city, country, phone, email').eq('org_id', m.org_id).eq('active', true).order('name'),
    adminClient.from('contacts')
      .select('id, name, email, phone, bill_street, bill_city, bill_country, terms, currency, price_level_id, default_location')
      .eq('org_id', m.org_id).eq('type', 'customer').eq('is_active', true).order('name'),
    adminClient.from('products')
      .select('id, name, sku, sell_uom, sell_price, tax_rate, sell_tax_rate_id, description, track_stock, type')
      .eq('org_id', m.org_id).eq('is_active', true).order('name'),
    adminClient.from('organisations').select('so_default_payment_terms, so_default_ship_from, decimal_places, fulfilment_mode, quotes_enabled').eq('id', m.org_id).single(),
    adminClient.from('tax_rates').select('id, name, rate, is_default').eq('org_id', m.org_id).order('name'),
    adminClient.from('stock_levels').select('product_id, location_id, quantity, committed').eq('org_id', m.org_id),
    adminClient.from('price_levels').select('id, name, is_default').eq('org_id', m.org_id).order('name'),
    adminClient.from('currencies').select('code, is_base').eq('org_id', m.org_id).order('code'),
    adminClient.from('product_prices').select('product_id, level_id, price, break_qty').eq('org_id', m.org_id),
    adminClient.from('product_pricing').select('product_id, price_level_id, price').eq('org_id', m.org_id),
  ])

  // Price-level prices per product (quantity breaks supported)
  const byProduct = new Map<string, { price_level_id: string; price: number; break_qty: number }[]>()
  const addPrice = (pid: string, level: string, price: number, brk: number) => {
    if (!pid || !level) return
    const arr = byProduct.get(pid) ?? []
    arr.push({ price_level_id: level, price: Number(price) || 0, break_qty: Number(brk) || 1 })
    byProduct.set(pid, arr)
  }
  for (const r of (prices ?? []) as { product_id: string; level_id: string; price: number; break_qty: number }[]) addPrice(r.product_id, r.level_id, r.price, r.break_qty)
  for (const r of (pricing ?? []) as { product_id: string; price_level_id: string; price: number }[]) addPrice(r.product_id, r.price_level_id, r.price, 1)
  const productsWithPrices = ((products ?? []) as { id: string }[]).map(p => ({ ...p, price_levels: byProduct.get(p.id) ?? [] }))

  const curs = (currencies ?? []) as { code: string; is_base: boolean | null }[]
  const orgData = (org ?? {}) as { so_default_payment_terms?: string | null; so_default_ship_from?: string | null; decimal_places?: number | null; fulfilment_mode?: string | null; quotes_enabled?: boolean | null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  const bySort = (a: { sort_order: number | null }, b: { sort_order: number | null }) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  const shaped = {
    ...o,
    lines: [...(o.sales_order_lines ?? [])].sort(bySort),
    cost_lines: [...(o.sales_order_cost_lines ?? [])].sort(bySort),
  }

  return (
    <SalesOrderForm
      // A fresh key per order/status so client state never leaks between orders
      key={`${o.id}-${o.status}-${o.total_amount}`}
      orgId={m.org_id}
      order={shaped}
      relatedPoId={relatedPoId}
      xeroInvoice={{ show: xeroInfo.show, canPost: xeroInfo.canPost, info: xeroInfo.records[id] ?? null }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customers={(customers ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      locations={(locations ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products={productsWithPrices as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      taxRates={(taxRates ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockLevels={(stockLevels ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      priceLevels={(priceLevels ?? []) as any}
      currencies={curs.map(c => c.code)}
      baseCurrency={curs.find(c => c.is_base)?.code ?? 'NZD'}
      defaultTerms={orgData.so_default_payment_terms ?? null}
      decimalPlaces={orgData.decimal_places ?? 2}
      fulfilmentMode={orgData.fulfilment_mode ?? 'full'}
      quotesEnabled={Boolean(orgData.quotes_enabled)}
    />
  )
}
