// src/lib/reports/trade-reports.ts
// Sales, Purchases and Transfers reports.
import type { Col, Filters, ReportResult, Row, Tile } from './registry'
import {
  type Db, type ProductLite, costOf, daysBetween, fArr, fBool, fetchAll, fNum, fStr, hasTag, inChunks, inRange, isStocked, loadContactsMap, loadProducts, n0, r2, r4, statusOk, ymd,
} from './util'

const pct = (n: number, d: number) => (d ? r2((n / d) * 100) : 0)

// ═════════════════════════════ SALES
type SO = {
  id: string; so_number: string | null; order_date: string | null; created_at: string; customer_id: string | null; customer_name: string | null
  status: string | null; location_id: string | null; location_name: string | null; reference: string | null; expected_date: string | null
  delivery_date: string | null; shipped_date: string | null; total_amount: number | null; currency: string | null; price_level_name: string | null
  carrier: string | null; tracking_number: string | null; notes: string | null; terms: string | null
}
type SOL = { so_id: string; product_id: string | null; product_name: string | null; product_sku: string | null; quantity: number; unit_price: number | null; total_price: number | null }

async function loadSales(db: Db, orgId: string, f: Filters): Promise<{ orders: SO[]; truncated: boolean }> {
  const cust = fStr(f, 'customer'), loc = fStr(f, 'location'), from = fStr(f, 'date_from'), to = fStr(f, 'date_to')
  const picked = fArr(f, 'status'), incl = fBool(f, 'inclAll'), min = fNum(f, 'amtMin'), max = fNum(f, 'amtMax')
  const { rows, truncated } = await fetchAll<SO>((a, b) => {
    let q = db.from('sales_orders').select('id, so_number, order_date, created_at, customer_id, customer_name, status, location_id, location_name, reference, expected_date, delivery_date, shipped_date, total_amount, currency, price_level_name, carrier, tracking_number, notes, terms').eq('org_id', orgId)
    if (cust) q = q.eq('customer_id', cust)
    if (loc) q = q.eq('location_id', loc)
    return q.order('created_at', { ascending: false }).range(a, b)
  })
  const orders = rows.filter(o => {
    if (!statusOk(o.status, picked, incl)) return false
    if (!inRange(ymd(o.order_date ?? o.created_at), from, to)) return false
    const t = n0(o.total_amount)
    if (min !== null && t < min) return false
    if (max !== null && t > max) return false
    return true
  })
  return { orders, truncated }
}

async function loadSalesLines(db: Db, orgId: string, ids: string[]): Promise<SOL[]> {
  return inChunks<SOL>(ids, (c, a, b) => db.from('sales_order_lines').select('so_id, product_id, product_name, product_sku, quantity, unit_price, total_price').eq('org_id', orgId).in('so_id', c).range(a, b))
}

const lineRevenue = (l: { quantity: number; unit_price: number | null; total_price: number | null }) => (l.total_price != null ? n0(l.total_price) : n0(l.quantity) * n0(l.unit_price))
const soDate = (o: SO) => ymd(o.order_date ?? o.created_at)

export async function salesOrdersReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const { orders, truncated } = await loadSales(db, orgId, f)
  const lines = await loadSalesLines(db, orgId, orders.map(o => o.id))
  const agg = new Map<string, { n: number; units: number }>()
  for (const l of lines) { const a = agg.get(l.so_id) ?? { n: 0, units: 0 }; a.n++; a.units += n0(l.quantity); agg.set(l.so_id, a) }
  const rows: Row[] = orders.map(o => ({
    number: o.so_number, date: soDate(o), customer: o.customer_name, status: o.status ?? 'Draft', location: o.location_name, reference: o.reference,
    expected: ymd(o.expected_date) || null, shipped: ymd(o.shipped_date) || null, lines: agg.get(o.id)?.n ?? 0, units: r4(agg.get(o.id)?.units ?? 0),
    total: r2(n0(o.total_amount)), currency: o.currency, price_level: o.price_level_name, carrier: o.carrier, tracking: o.tracking_number, terms: o.terms, notes: o.notes,
    _href: `/sales/${o.id}`,
  }))
  const columns: Col[] = [
    { key: 'number', label: 'Order #', type: 'text', required: true },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'customer', label: 'Customer', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'reference', label: 'Reference', type: 'text', off: true },
    { key: 'expected', label: 'Expected', type: 'date', off: true },
    { key: 'shipped', label: 'Shipped', type: 'date', off: true },
    { key: 'lines', label: 'Lines', type: 'num', sum: true },
    { key: 'units', label: 'Units', type: 'qty', sum: true },
    { key: 'total', label: 'Total', type: 'money', sum: true },
    { key: 'currency', label: 'Currency', type: 'text', off: true },
    { key: 'price_level', label: 'Price level', type: 'text', off: true },
    { key: 'carrier', label: 'Carrier', type: 'text', off: true },
    { key: 'tracking', label: 'Tracking #', type: 'text', off: true },
    { key: 'terms', label: 'Terms', type: 'text', off: true },
    { key: 'notes', label: 'Notes', type: 'text', off: true },
  ]
  const total = rows.reduce((s, r) => s + n0(r.total), 0)
  const tiles: Tile[] = [
    { label: 'Orders', value: rows.length, type: 'num' },
    { label: 'Total value', value: r2(total), type: 'money' },
    { label: 'Average order', value: rows.length ? r2(total / rows.length) : 0, type: 'money' },
    { label: 'Units sold', value: r4(rows.reduce((s, r) => s + n0(r.units), 0)), type: 'num' },
  ]
  return { columns, rows, tiles, truncated }
}

export async function salesProductsReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const prod = fStr(f, 'product'), tag = fStr(f, 'tag')
  const [{ orders, truncated }, { map }] = await Promise.all([loadSales(db, orgId, f), loadProducts(db, orgId)])
  const byId = new Map(orders.map(o => [o.id, o]))
  const lines = await loadSalesLines(db, orgId, orders.map(o => o.id))
  type A = { key: string; name: string; sku: string | null; qty: number; rev: number; orders: Set<string>; custs: Set<string>; last: string }
  const agg = new Map<string, A>()
  for (const l of lines) {
    if (prod && l.product_id !== prod) continue
    const p = l.product_id ? map.get(l.product_id) : undefined
    if (tag && !hasTag(p, tag)) continue
    const o = byId.get(l.so_id)!
    const key = l.product_id ?? `n:${l.product_name}`
    const a = agg.get(key) ?? { key, name: p?.name ?? l.product_name ?? 'Unnamed item', sku: p?.sku ?? l.product_sku, qty: 0, rev: 0, orders: new Set<string>(), custs: new Set<string>(), last: '' }
    a.qty += n0(l.quantity); a.rev += lineRevenue(l); a.orders.add(o.id); a.custs.add(o.customer_id ?? o.customer_name ?? '')
    if (soDate(o) > a.last) a.last = soDate(o)
    agg.set(key, a)
  }
  const total = [...agg.values()].reduce((s, a) => s + a.rev, 0)
  const rows: Row[] = [...agg.values()].sort((a, b) => b.rev - a.rev).map(a => ({
    product: a.name, sku: a.sku, orders: a.orders.size, customers: a.custs.size, qty: r4(a.qty), revenue: r2(a.rev),
    avg_price: a.qty ? r2(a.rev / a.qty) : 0, share: pct(a.rev, total), last: a.last || null,
  }))
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'orders', label: 'Orders', type: 'num' },
    { key: 'customers', label: 'Customers', type: 'num' },
    { key: 'qty', label: 'Units sold', type: 'qty', sum: true },
    { key: 'revenue', label: 'Revenue', type: 'money', sum: true },
    { key: 'avg_price', label: 'Avg price', type: 'money' },
    { key: 'share', label: '% of revenue', type: 'pct' },
    { key: 'last', label: 'Last sold', type: 'date' },
  ]
  const tiles: Tile[] = [
    { label: 'Products sold', value: rows.length, type: 'num' },
    { label: 'Units sold', value: r4(rows.reduce((s, r) => s + n0(r.qty), 0)), type: 'num' },
    { label: 'Revenue', value: r2(total), type: 'money' },
    { label: 'Top product', value: String(rows[0]?.product ?? '—'), type: 'text' },
  ]
  return { columns, rows, tiles, truncated }
}

export async function salesCustomersReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const tier = fStr(f, 'tier'), country = fStr(f, 'country')
  const [{ orders, truncated }, contacts] = await Promise.all([loadSales(db, orgId, f), loadContactsMap(db, orgId)])
  type A = { id: string | null; name: string; n: number; rev: number; first: string; last: string }
  const agg = new Map<string, A>()
  for (const o of orders) {
    const c = o.customer_id ? contacts.get(o.customer_id) : undefined
    if (tier && c?.tier !== tier) continue
    if (country && c?.country !== country) continue
    const key = o.customer_id ?? `n:${o.customer_name}`
    const a = agg.get(key) ?? { id: o.customer_id, name: c?.name ?? o.customer_name ?? 'Unknown', n: 0, rev: 0, first: '', last: '' }
    a.n++; a.rev += n0(o.total_amount)
    const d = soDate(o)
    if (!a.first || d < a.first) a.first = d
    if (d > a.last) a.last = d
    agg.set(key, a)
  }
  const total = [...agg.values()].reduce((s, a) => s + a.rev, 0)
  const rows: Row[] = [...agg.values()].sort((a, b) => b.rev - a.rev).map(a => {
    const c = a.id ? contacts.get(a.id) : undefined
    return { customer: a.name, tier: c?.tier ?? null, country: c?.country ?? null, orders: a.n, revenue: r2(a.rev), avg: a.n ? r2(a.rev / a.n) : 0, share: pct(a.rev, total), first: a.first || null, last: a.last || null, owing: n0(c?.balance_owing) }
  })
  const columns: Col[] = [
    { key: 'customer', label: 'Customer', type: 'text', required: true },
    { key: 'tier', label: 'Tier', type: 'text' },
    { key: 'country', label: 'Country', type: 'text', off: true },
    { key: 'orders', label: 'Orders', type: 'num', sum: true },
    { key: 'revenue', label: 'Revenue', type: 'money', sum: true },
    { key: 'avg', label: 'Avg order', type: 'money' },
    { key: 'share', label: '% of revenue', type: 'pct' },
    { key: 'first', label: 'First order', type: 'date' },
    { key: 'last', label: 'Last order', type: 'date' },
    { key: 'owing', label: 'Balance owing', type: 'money', off: true, sum: true },
  ]
  const ords = rows.reduce((s, r) => s + n0(r.orders), 0)
  const tiles: Tile[] = [
    { label: 'Customers', value: rows.length, type: 'num' },
    { label: 'Orders', value: ords, type: 'num' },
    { label: 'Revenue', value: r2(total), type: 'money' },
    { label: 'Average order', value: ords ? r2(total / ords) : 0, type: 'money' },
  ]
  return { columns, rows, tiles, truncated }
}

export async function salesProfitReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const group = fStr(f, 'group') || 'order', prod = fStr(f, 'product'), below = fNum(f, 'marginBelow')
  const [{ orders, truncated }, { map }] = await Promise.all([loadSales(db, orgId, f), loadProducts(db, orgId)])
  const ids = orders.map(o => o.id)
  const [lines, mv] = await Promise.all([
    loadSalesLines(db, orgId, ids),
    inChunks<{ reference_id: string; product_id: string; qty: number; unit_cost: number | null }>(ids, (c, a, b) => db.from('stock_movements').select('reference_id, product_id, qty, unit_cost').eq('org_id', orgId).eq('movement_type', 'sale').in('reference_id', c).range(a, b)),
  ])
  // cost recorded at the moment each order shipped
  const recorded = new Map<string, { q: number; c: number }>()
  for (const m of mv) {
    if (m.unit_cost == null) continue
    const k = `${m.reference_id}|${m.product_id}`
    const a = recorded.get(k) ?? { q: 0, c: 0 }
    a.q += Math.abs(n0(m.qty)); a.c += Math.abs(n0(m.qty)) * n0(m.unit_cost)
    recorded.set(k, a)
  }
  const byId = new Map(orders.map(o => [o.id, o]))
  let estimated = 0
  type Ln = { o: SO; pid: string | null; name: string; sku: string | null; qty: number; rev: number; cost: number }
  const lns: Ln[] = []
  for (const l of lines) {
    if (prod && l.product_id !== prod) continue
    const o = byId.get(l.so_id)!
    const p: ProductLite | undefined = l.product_id ? map.get(l.product_id) : undefined
    const rec = l.product_id ? recorded.get(`${l.so_id}|${l.product_id}`) : undefined
    let unit: number
    if (rec && rec.q > 0) unit = rec.c / rec.q
    else { unit = costOf(p, 'avg'); if (isStocked(p)) estimated++ }
    const qty = n0(l.quantity)
    lns.push({ o, pid: l.product_id, name: p?.name ?? l.product_name ?? 'Unnamed item', sku: p?.sku ?? l.product_sku, qty, rev: lineRevenue(l), cost: unit * qty })
  }

  type G = { label: string; sku: string | null; extra: Record<string, string | number | null>; qty: number; rev: number; cost: number; href?: string; orders: Set<string> }
  const groups = new Map<string, G>()
  for (const l of lns) {
    let key: string, label: string, sku: string | null = null, extra: G['extra'] = {}, href: string | undefined
    if (group === 'product') { key = l.pid ?? `n:${l.name}`; label = l.name; sku = l.sku }
    else if (group === 'customer') { key = l.o.customer_id ?? `n:${l.o.customer_name}`; label = l.o.customer_name ?? 'Unknown' }
    else { key = l.o.id; label = l.o.so_number ?? ''; extra = { date: soDate(l.o), customer: l.o.customer_name, status: l.o.status }; href = `/sales/${l.o.id}` }
    const g = groups.get(key) ?? { label, sku, extra, qty: 0, rev: 0, cost: 0, href, orders: new Set<string>() }
    g.qty += l.qty; g.rev += l.rev; g.cost += l.cost; g.orders.add(l.o.id)
    groups.set(key, g)
  }
  let rows: Row[] = [...groups.values()].map(g => {
    const profit = g.rev - g.cost
    const base: Row = { name: g.label, sku: g.sku, ...g.extra, orders: g.orders.size, qty: r4(g.qty), revenue: r2(g.rev), cost: r2(g.cost), profit: r2(profit), margin: g.rev ? r2((profit / g.rev) * 100) : 0 }
    if (g.href) base._href = g.href
    return base
  })
  if (below !== null) rows = rows.filter(r => n0(r.margin) < below)
  rows.sort((a, b) => (group === 'order' ? String(b.date).localeCompare(String(a.date)) : n0(b.profit) - n0(a.profit)))

  const money = (key: string, label: string): Col => ({ key, label, type: 'money', sum: true })
  const columns: Col[] = group === 'order'
    ? [{ key: 'name', label: 'Order #', type: 'text', required: true }, { key: 'date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'status', label: 'Status', type: 'badge' },
       { key: 'qty', label: 'Units', type: 'qty', sum: true }, money('revenue', 'Revenue'), money('cost', 'Cost'), money('profit', 'Profit'), { key: 'margin', label: 'Margin', type: 'pct' }]
    : group === 'product'
      ? [{ key: 'name', label: 'Product', type: 'text', required: true }, { key: 'sku', label: 'SKU', type: 'text' }, { key: 'orders', label: 'Orders', type: 'num' },
         { key: 'qty', label: 'Units', type: 'qty', sum: true }, money('revenue', 'Revenue'), money('cost', 'Cost'), money('profit', 'Profit'), { key: 'margin', label: 'Margin', type: 'pct' }]
      : [{ key: 'name', label: 'Customer', type: 'text', required: true }, { key: 'orders', label: 'Orders', type: 'num', sum: true },
         { key: 'qty', label: 'Units', type: 'qty', sum: true }, money('revenue', 'Revenue'), money('cost', 'Cost'), money('profit', 'Profit'), { key: 'margin', label: 'Margin', type: 'pct' }]

  const rev = rows.reduce((s, r) => s + n0(r.revenue), 0), cost = rows.reduce((s, r) => s + n0(r.cost), 0)
  const tiles: Tile[] = [
    { label: 'Revenue', value: r2(rev), type: 'money' },
    { label: 'Cost of goods', value: r2(cost), type: 'money' },
    { label: 'Profit', value: r2(rev - cost), type: 'money' },
    { label: 'Margin', value: pct(rev - cost, rev), type: 'pct' },
  ]
  const note = `Cost is what the stock cost when each order shipped${estimated ? `; ${estimated} line${estimated === 1 ? '' : 's'} had no recorded cost (not shipped yet) and use the product's average cost instead` : ''}. Order-level discounts and shipping charges are not included.`
  return { columns, rows, tiles, note, truncated }
}

// ═════════════════════════════ PURCHASES
type PO = {
  id: string; po_number: string | null; order_date: string | null; created_at: string; supplier_id: string | null; supplier_name: string | null
  status: string | null; location_id: string | null; location_name: string | null; reference: string | null; expected_date: string | null
  received_date: string | null; total_amount: number | null; currency: string | null; terms: string | null; additional_costs: number | null
  order_discount_amount: number | null; notes: string | null
}
type POL = { po_id: string; product_id: string | null; product_name: string | null; product_sku: string | null; quantity_ordered: number; quantity_received: number | null; unit_cost: number | null; total_cost: number | null }

async function loadPurchases(db: Db, orgId: string, f: Filters): Promise<{ orders: PO[]; truncated: boolean }> {
  const sup = fStr(f, 'supplier'), loc = fStr(f, 'location'), from = fStr(f, 'date_from'), to = fStr(f, 'date_to')
  const picked = fArr(f, 'status'), incl = fBool(f, 'inclAll'), min = fNum(f, 'amtMin'), max = fNum(f, 'amtMax')
  const { rows, truncated } = await fetchAll<PO>((a, b) => {
    let q = db.from('purchase_orders').select('id, po_number, order_date, created_at, supplier_id, supplier_name, status, location_id, location_name, reference, expected_date, received_date, total_amount, currency, terms, additional_costs, order_discount_amount, notes').eq('org_id', orgId)
    if (sup) q = q.eq('supplier_id', sup)
    if (loc) q = q.eq('location_id', loc)
    return q.order('created_at', { ascending: false }).range(a, b)
  })
  const orders = rows.filter(o => {
    if (!statusOk(o.status, picked, incl)) return false
    if (!inRange(ymd(o.order_date ?? o.created_at), from, to)) return false
    const t = n0(o.total_amount)
    if (min !== null && t < min) return false
    if (max !== null && t > max) return false
    return true
  })
  return { orders, truncated }
}

async function loadPurchaseLines(db: Db, orgId: string, ids: string[]): Promise<POL[]> {
  return inChunks<POL>(ids, (c, a, b) => db.from('purchase_order_lines').select('po_id, product_id, product_name, product_sku, quantity_ordered, quantity_received, unit_cost, total_cost').eq('org_id', orgId).in('po_id', c).range(a, b))
}

const poDate = (o: PO) => ymd(o.order_date ?? o.created_at)
const poLineSpend = (l: POL) => (l.total_cost != null ? n0(l.total_cost) : n0(l.quantity_ordered) * n0(l.unit_cost))

export async function purchaseOrdersReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const { orders, truncated } = await loadPurchases(db, orgId, f)
  const lines = await loadPurchaseLines(db, orgId, orders.map(o => o.id))
  const agg = new Map<string, { n: number; ord: number; rec: number }>()
  for (const l of lines) { const a = agg.get(l.po_id) ?? { n: 0, ord: 0, rec: 0 }; a.n++; a.ord += n0(l.quantity_ordered); a.rec += n0(l.quantity_received); agg.set(l.po_id, a) }
  const rows: Row[] = orders.map(o => ({
    number: o.po_number, date: poDate(o), supplier: o.supplier_name, status: o.status ?? 'Draft', location: o.location_name, reference: o.reference,
    expected: ymd(o.expected_date) || null, received_on: ymd(o.received_date) || null, lines: agg.get(o.id)?.n ?? 0, ordered: r4(agg.get(o.id)?.ord ?? 0), received: r4(agg.get(o.id)?.rec ?? 0),
    extra: n0(o.additional_costs) || null, discount: n0(o.order_discount_amount) || null, total: r2(n0(o.total_amount)), currency: o.currency, terms: o.terms, notes: o.notes, _href: `/purchases/${o.id}`,
  }))
  const columns: Col[] = [
    { key: 'number', label: 'PO #', type: 'text', required: true },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'location', label: 'Receive at', type: 'text' },
    { key: 'reference', label: 'Reference', type: 'text', off: true },
    { key: 'expected', label: 'Expected', type: 'date' },
    { key: 'received_on', label: 'Received', type: 'date', off: true },
    { key: 'lines', label: 'Lines', type: 'num', sum: true },
    { key: 'ordered', label: 'Units ordered', type: 'qty', sum: true },
    { key: 'received', label: 'Units received', type: 'qty', sum: true },
    { key: 'extra', label: 'Additional costs', type: 'money', off: true, sum: true },
    { key: 'discount', label: 'Discount', type: 'money', off: true, sum: true },
    { key: 'total', label: 'Total', type: 'money', sum: true },
    { key: 'currency', label: 'Currency', type: 'text', off: true },
    { key: 'terms', label: 'Terms', type: 'text', off: true },
    { key: 'notes', label: 'Notes', type: 'text', off: true },
  ]
  const total = rows.reduce((s, r) => s + n0(r.total), 0)
  const tiles: Tile[] = [
    { label: 'Purchase orders', value: rows.length, type: 'num' },
    { label: 'Total spend', value: r2(total), type: 'money' },
    { label: 'Average order', value: rows.length ? r2(total / rows.length) : 0, type: 'money' },
    { label: 'Units ordered', value: r4(rows.reduce((s, r) => s + n0(r.ordered), 0)), type: 'num' },
  ]
  return { columns, rows, tiles, truncated }
}

export async function purchaseProductsReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const prod = fStr(f, 'product'), tag = fStr(f, 'tag')
  const [{ orders, truncated }, { map }] = await Promise.all([loadPurchases(db, orgId, f), loadProducts(db, orgId)])
  const byId = new Map(orders.map(o => [o.id, o]))
  const lines = await loadPurchaseLines(db, orgId, orders.map(o => o.id))
  type A = { name: string; sku: string | null; ord: number; rec: number; spend: number; orders: Set<string>; sups: Set<string>; last: string; lastCost: number | null; min: number | null; max: number | null }
  const agg = new Map<string, A>()
  for (const l of lines) {
    if (prod && l.product_id !== prod) continue
    const p = l.product_id ? map.get(l.product_id) : undefined
    if (tag && !hasTag(p, tag)) continue
    const o = byId.get(l.po_id)!
    const key = l.product_id ?? `n:${l.product_name}`
    const a = agg.get(key) ?? { name: p?.name ?? l.product_name ?? 'Unnamed item', sku: p?.sku ?? l.product_sku, ord: 0, rec: 0, spend: 0, orders: new Set<string>(), sups: new Set<string>(), last: '', lastCost: null, min: null, max: null }
    a.ord += n0(l.quantity_ordered); a.rec += n0(l.quantity_received); a.spend += poLineSpend(l); a.orders.add(o.id); a.sups.add(o.supplier_id ?? o.supplier_name ?? '')
    const uc = l.unit_cost == null ? null : n0(l.unit_cost)
    if (uc !== null) { a.min = a.min === null ? uc : Math.min(a.min, uc); a.max = a.max === null ? uc : Math.max(a.max, uc); if (poDate(o) >= a.last) { a.last = poDate(o); a.lastCost = uc } }
    agg.set(key, a)
  }
  const rows: Row[] = [...agg.values()].sort((a, b) => b.spend - a.spend).map(a => ({
    product: a.name, sku: a.sku, orders: a.orders.size, suppliers: a.sups.size, ordered: r4(a.ord), received: r4(a.rec), spend: r2(a.spend),
    avg_cost: a.ord ? r2(a.spend / a.ord) : 0, last_cost: a.lastCost, lowest: a.min, highest: a.max, last: a.last || null,
  }))
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'orders', label: 'Orders', type: 'num' },
    { key: 'suppliers', label: 'Suppliers', type: 'num', off: true },
    { key: 'ordered', label: 'Units ordered', type: 'qty', sum: true },
    { key: 'received', label: 'Units received', type: 'qty', sum: true },
    { key: 'spend', label: 'Spend', type: 'money', sum: true },
    { key: 'avg_cost', label: 'Avg unit cost', type: 'money' },
    { key: 'last_cost', label: 'Last unit cost', type: 'money' },
    { key: 'lowest', label: 'Lowest cost', type: 'money', off: true },
    { key: 'highest', label: 'Highest cost', type: 'money', off: true },
    { key: 'last', label: 'Last bought', type: 'date' },
  ]
  const spend = rows.reduce((s, r) => s + n0(r.spend), 0)
  const tiles: Tile[] = [
    { label: 'Products bought', value: rows.length, type: 'num' },
    { label: 'Units ordered', value: r4(rows.reduce((s, r) => s + n0(r.ordered), 0)), type: 'num' },
    { label: 'Total spend', value: r2(spend), type: 'money' },
    { label: 'Biggest spend', value: String(rows[0]?.product ?? '—'), type: 'text' },
  ]
  return { columns, rows, tiles, truncated }
}

export async function purchaseSuppliersReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const country = fStr(f, 'country')
  const [{ orders, truncated }, contacts] = await Promise.all([loadPurchases(db, orgId, f), loadContactsMap(db, orgId)])
  type A = { id: string | null; name: string; n: number; spend: number; first: string; last: string; lead: number[]; onTime: number; timed: number }
  const agg = new Map<string, A>()
  for (const o of orders) {
    const c = o.supplier_id ? contacts.get(o.supplier_id) : undefined
    if (country && c?.country !== country) continue
    const key = o.supplier_id ?? `n:${o.supplier_name}`
    const a = agg.get(key) ?? { id: o.supplier_id, name: c?.name ?? o.supplier_name ?? 'Unknown', n: 0, spend: 0, first: '', last: '', lead: [], onTime: 0, timed: 0 }
    a.n++; a.spend += n0(o.total_amount)
    const d = poDate(o)
    if (!a.first || d < a.first) a.first = d
    if (d > a.last) a.last = d
    const rec = ymd(o.received_date)
    if (rec) {
      a.lead.push(daysBetween(d, rec))
      const exp = ymd(o.expected_date)
      if (exp) { a.timed++; if (rec <= exp) a.onTime++ }
    }
    agg.set(key, a)
  }
  const rows: Row[] = [...agg.values()].sort((a, b) => b.spend - a.spend).map(a => ({
    supplier: a.name, country: (a.id ? contacts.get(a.id)?.country : null) ?? null, orders: a.n, spend: r2(a.spend), avg: a.n ? r2(a.spend / a.n) : 0,
    lead: a.lead.length ? Math.round((a.lead.reduce((s, x) => s + x, 0) / a.lead.length) * 10) / 10 : null, on_time: a.timed ? pct(a.onTime, a.timed) : null,
    first: a.first || null, last: a.last || null,
  }))
  const columns: Col[] = [
    { key: 'supplier', label: 'Supplier', type: 'text', required: true },
    { key: 'country', label: 'Country', type: 'text', off: true },
    { key: 'orders', label: 'Orders', type: 'num', sum: true },
    { key: 'spend', label: 'Spend', type: 'money', sum: true },
    { key: 'avg', label: 'Avg order', type: 'money' },
    { key: 'lead', label: 'Avg lead time (days)', type: 'num' },
    { key: 'on_time', label: 'On time', type: 'pct' },
    { key: 'first', label: 'First order', type: 'date' },
    { key: 'last', label: 'Last order', type: 'date' },
  ]
  const spend = rows.reduce((s, r) => s + n0(r.spend), 0)
  const ords = rows.reduce((s, r) => s + n0(r.orders), 0)
  const tiles: Tile[] = [
    { label: 'Suppliers', value: rows.length, type: 'num' },
    { label: 'Orders', value: ords, type: 'num' },
    { label: 'Total spend', value: r2(spend), type: 'money' },
    { label: 'Average order', value: ords ? r2(spend / ords) : 0, type: 'money' },
  ]
  return { columns, rows, tiles, note: 'Lead time and on-time are measured on orders that have a received date. On time means received on or before the expected date.', truncated }
}

export async function costHistoryReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const prod = fStr(f, 'product'), tag = fStr(f, 'tag'), changedOnly = fBool(f, 'changedOnly')
  const [{ orders, truncated }, { map }] = await Promise.all([loadPurchases(db, orgId, f), loadProducts(db, orgId)])
  const byId = new Map(orders.map(o => [o.id, o]))
  const lines = await loadPurchaseLines(db, orgId, orders.map(o => o.id))
  type L = { pid: string; name: string; sku: string | null; date: string; po: string | null; poId: string; supplier: string | null; qty: number; cost: number }
  const all: L[] = []
  for (const l of lines) {
    if (!l.product_id || l.unit_cost == null) continue
    if (prod && l.product_id !== prod) continue
    const p = map.get(l.product_id)
    if (tag && !hasTag(p, tag)) continue
    const o = byId.get(l.po_id)!
    all.push({ pid: l.product_id, name: p?.name ?? l.product_name ?? '', sku: p?.sku ?? l.product_sku, date: poDate(o), po: o.po_number, poId: o.id, supplier: o.supplier_name, qty: n0(l.quantity_ordered), cost: n0(l.unit_cost) })
  }
  all.sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date) || String(a.po).localeCompare(String(b.po)))
  const prev = new Map<string, number>()
  let rows: Row[] = all.map(l => {
    const before = prev.get(l.pid)
    prev.set(l.pid, l.cost)
    const change = before === undefined ? null : r2(l.cost - before)
    return {
      product: l.name, sku: l.sku, date: l.date, po: l.po, supplier: l.supplier, qty: r4(l.qty), cost: r2(l.cost), prev: before === undefined ? null : r2(before),
      change, change_pct: before ? r2(((l.cost - before) / before) * 100) : null, _href: `/purchases/${l.poId}`,
    }
  })
  if (changedOnly) rows = rows.filter(r => r.change !== null && n0(r.change) !== 0)
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'po', label: 'PO #', type: 'text' },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'qty', label: 'Qty', type: 'qty', off: true },
    { key: 'cost', label: 'Unit cost', type: 'money' },
    { key: 'prev', label: 'Previous cost', type: 'money' },
    { key: 'change', label: 'Change', type: 'money' },
    { key: 'change_pct', label: 'Change %', type: 'pct' },
  ]
  const costs = rows.map(r => n0(r.cost))
  const up = rows.filter(r => r.change !== null && n0(r.change) > 0).length
  const down = rows.filter(r => r.change !== null && n0(r.change) < 0).length
  const tiles: Tile[] = prod && costs.length
    ? [
        { label: 'Lowest cost', value: Math.min(...costs), type: 'money' },
        { label: 'Highest cost', value: Math.max(...costs), type: 'money' },
        { label: 'Average cost', value: r2(costs.reduce((s, x) => s + x, 0) / costs.length), type: 'money' },
        { label: 'Latest cost', value: costs[costs.length - 1], type: 'money' },
      ]
    : [
        { label: 'Purchases', value: rows.length, type: 'num' },
        { label: 'Products', value: new Set(rows.map(r => r.sku ?? r.product)).size, type: 'num' },
        { label: 'Cost increases', value: up, type: 'num' },
        { label: 'Cost decreases', value: down, type: 'num' },
      ]
  return { columns, rows, tiles, truncated }
}

// ═════════════════════════════ TRANSFERS
type TR = {
  id: string; tr_number: string | null; transfer_date: string | null; created_at: string; from_location_id: string | null; to_location_id: string | null
  from_location_name: string | null; to_location_name: string | null; status: string | null; expected_date: string | null; notes: string | null; closed_at: string | null
}
type TRL = { tr_id: string; product_id: string | null; product_name: string | null; product_sku: string | null; quantity: number; quantity_picked: number | null; quantity_received: number | null }

async function loadTransfers(db: Db, orgId: string, f: Filters): Promise<{ orders: TR[]; truncated: boolean }> {
  const from = fStr(f, 'from'), to = fStr(f, 'to'), dFrom = fStr(f, 'date_from'), dTo = fStr(f, 'date_to'), picked = fArr(f, 'status'), incl = fBool(f, 'inclAll')
  const { rows, truncated } = await fetchAll<TR>((a, b) => {
    let q = db.from('transfer_orders').select('id, tr_number, transfer_date, created_at, from_location_id, to_location_id, from_location_name, to_location_name, status, expected_date, notes, closed_at').eq('org_id', orgId)
    if (from) q = q.eq('from_location_id', from)
    if (to) q = q.eq('to_location_id', to)
    return q.order('created_at', { ascending: false }).range(a, b)
  })
  return { orders: rows.filter(o => statusOk(o.status, picked, incl) && inRange(ymd(o.transfer_date ?? o.created_at), dFrom, dTo)), truncated }
}

async function loadTransferLines(db: Db, orgId: string, ids: string[]): Promise<TRL[]> {
  return inChunks<TRL>(ids, (c, a, b) => db.from('transfer_order_lines').select('tr_id, product_id, product_name, product_sku, quantity, quantity_picked, quantity_received').eq('org_id', orgId).in('tr_id', c).range(a, b))
}

const trDate = (o: TR) => ymd(o.transfer_date ?? o.created_at)

export async function transferOrdersReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const [{ orders, truncated }, { map }] = await Promise.all([loadTransfers(db, orgId, f), loadProducts(db, orgId)])
  const lines = await loadTransferLines(db, orgId, orders.map(o => o.id))
  const agg = new Map<string, { n: number; qty: number; picked: number; rec: number; value: number }>()
  for (const l of lines) {
    const a = agg.get(l.tr_id) ?? { n: 0, qty: 0, picked: 0, rec: 0, value: 0 }
    a.n++; a.qty += n0(l.quantity); a.picked += n0(l.quantity_picked); a.rec += n0(l.quantity_received)
    a.value += n0(l.quantity) * costOf(l.product_id ? map.get(l.product_id) : undefined, 'avg')
    agg.set(l.tr_id, a)
  }
  const rows: Row[] = orders.map(o => {
    const a = agg.get(o.id)
    return {
      number: o.tr_number, date: trDate(o), from: o.from_location_name, to: o.to_location_name, status: o.status ?? 'Draft', expected: ymd(o.expected_date) || null,
      lines: a?.n ?? 0, qty: r4(a?.qty ?? 0), picked: r4(a?.picked ?? 0), received: r4(a?.rec ?? 0), value: r2(a?.value ?? 0), closed: ymd(o.closed_at) || null, notes: o.notes, _href: `/transfers/${o.id}`,
    }
  })
  const columns: Col[] = [
    { key: 'number', label: 'Transfer #', type: 'text', required: true },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'from', label: 'From', type: 'text' },
    { key: 'to', label: 'To', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'expected', label: 'Expected', type: 'date', off: true },
    { key: 'lines', label: 'Lines', type: 'num', sum: true },
    { key: 'qty', label: 'Units', type: 'qty', sum: true },
    { key: 'picked', label: 'Picked', type: 'qty', off: true, sum: true },
    { key: 'received', label: 'Received', type: 'qty', sum: true },
    { key: 'value', label: 'Value', type: 'money', sum: true },
    { key: 'closed', label: 'Closed', type: 'date', off: true },
    { key: 'notes', label: 'Notes', type: 'text', off: true },
  ]
  const tiles: Tile[] = [
    { label: 'Transfers', value: rows.length, type: 'num' },
    { label: 'Units moved', value: r4(rows.reduce((s, r) => s + n0(r.qty), 0)), type: 'num' },
    { label: 'Value moved', value: r2(rows.reduce((s, r) => s + n0(r.value), 0)), type: 'money', hint: 'at average cost' },
    { label: 'Still open', value: rows.filter(r => !['Closed', 'Cancelled'].includes(String(r.status))).length, type: 'num' },
  ]
  return { columns, rows, tiles, truncated }
}

export async function transferProductsReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const group = fStr(f, 'group') || 'product', prod = fStr(f, 'product'), tag = fStr(f, 'tag')
  const [{ orders, truncated }, { map }] = await Promise.all([loadTransfers(db, orgId, f), loadProducts(db, orgId)])
  const byId = new Map(orders.map(o => [o.id, o]))
  const lines = await loadTransferLines(db, orgId, orders.map(o => o.id))
  type A = { name: string; sku: string | null; from: string | null; to: string | null; trs: Set<string>; qty: number; picked: number; rec: number; value: number; last: string }
  const agg = new Map<string, A>()
  for (const l of lines) {
    if (prod && l.product_id !== prod) continue
    const p = l.product_id ? map.get(l.product_id) : undefined
    if (tag && !hasTag(p, tag)) continue
    const o = byId.get(l.tr_id)!
    const key = `${l.product_id ?? `n:${l.product_name}`}${group === 'route' ? `|${o.from_location_id}|${o.to_location_id}` : ''}`
    const a = agg.get(key) ?? { name: p?.name ?? l.product_name ?? 'Unnamed item', sku: p?.sku ?? l.product_sku, from: group === 'route' ? o.from_location_name : null, to: group === 'route' ? o.to_location_name : null, trs: new Set<string>(), qty: 0, picked: 0, rec: 0, value: 0, last: '' }
    a.trs.add(o.id); a.qty += n0(l.quantity); a.picked += n0(l.quantity_picked); a.rec += n0(l.quantity_received)
    a.value += n0(l.quantity) * costOf(p, 'avg')
    if (trDate(o) > a.last) a.last = trDate(o)
    agg.set(key, a)
  }
  const rows: Row[] = [...agg.values()].sort((a, b) => b.qty - a.qty).map(a => ({
    product: a.name, sku: a.sku, from: a.from, to: a.to, transfers: a.trs.size, qty: r4(a.qty), picked: r4(a.picked), received: r4(a.rec), value: r2(a.value), last: a.last || null,
  }))
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    ...(group === 'route' ? [{ key: 'from', label: 'From', type: 'text' as const }, { key: 'to', label: 'To', type: 'text' as const }] : []),
    { key: 'transfers', label: 'Transfers', type: 'num' },
    { key: 'qty', label: 'Units', type: 'qty', sum: true },
    { key: 'picked', label: 'Picked', type: 'qty', off: true, sum: true },
    { key: 'received', label: 'Received', type: 'qty', sum: true },
    { key: 'value', label: 'Value', type: 'money', sum: true },
    { key: 'last', label: 'Last moved', type: 'date' },
  ]
  const tiles: Tile[] = [
    { label: 'Products moved', value: new Set(rows.map(r => r.sku ?? r.product)).size, type: 'num' },
    { label: 'Units', value: r4(rows.reduce((s, r) => s + n0(r.qty), 0)), type: 'num' },
    { label: 'Received', value: r4(rows.reduce((s, r) => s + n0(r.received), 0)), type: 'num' },
    { label: 'Value moved', value: r2(rows.reduce((s, r) => s + n0(r.value), 0)), type: 'money', hint: 'at average cost' },
  ]
  return { columns, rows, tiles, truncated }
}
