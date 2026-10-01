// src/lib/reports/stock-reports.ts
// Contacts, Products and the six Stock reports.
import type { Col, Filters, ReportResult, Row, Tile } from './registry'
import {
  type Db, type ProductLite, BASIS_LABEL, basisOf, costOf, customValues, dayIn, daysBetween, endOfDayUtc, fArr, fBool, fetchAll, fNum, fStr,
  hasTag, inRange, isStocked, loadBins, loadContactsMap, loadLocations, loadOrg, loadProducts, n0, r2, r4, todayIn, ymd,
} from './util'

type Level = { product_id: string; location_id: string; quantity: number; reserved_quantity: number | null; on_order: number | null; committed: number | null; on_hold: number | null; bin: string | null }
type Group = { id: string; product_id: string; location_id: string; bin_id: string | null; batch_number: string | null; serial_number: string | null; expiry_date: string | null; quantity: number; created_at: string }

async function loadLevels(db: Db, orgId: string, locationId: string): Promise<{ rows: Level[]; truncated: boolean }> {
  return fetchAll<Level>((a, b) => {
    let q = db.from('stock_levels').select('product_id, location_id, quantity, reserved_quantity, on_order, committed, on_hold, bin').eq('org_id', orgId)
    if (locationId) q = q.eq('location_id', locationId)
    return q.range(a, b)
  })
}

async function loadGroups(db: Db, orgId: string, locationId: string): Promise<Group[]> {
  const { rows } = await fetchAll<Group>((a, b) => {
    let q = db.from('stock_groups').select('id, product_id, location_id, bin_id, batch_number, serial_number, expiry_date, quantity, created_at').eq('org_id', orgId).gt('quantity', 0)
    if (locationId) q = q.eq('location_id', locationId)
    return q.range(a, b)
  })
  return rows
}

/** Products that pass the supplier / tag filters. */
function productPass(p: ProductLite | undefined, f: Filters): boolean {
  if (!p) return false
  const sup = fStr(f, 'supplier')
  if (sup && p.default_supplier_id !== sup) return false
  return hasTag(p, fStr(f, 'tag'))
}

const pct = (n: number, d: number) => (d ? r2((n / d) * 100) : 0)

// ───────────────────────────── Contacts
export async function contactsReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const [{ rows, truncated }, { data: defs }, { data: levels }] = await Promise.all([
    fetchAll<Record<string, unknown>>((a, b) => db.from('contacts').select('*').eq('org_id', orgId).order('name').range(a, b)),
    db.from('contact_custom_fields').select('id, name, sort_order').eq('org_id', orgId).order('sort_order'),
    db.from('price_levels').select('id, name').eq('org_id', orgId),
  ])
  const idToName = new Map<string, string>(((defs ?? []) as { id: string; name: string }[]).map(d => [d.id, d.name]))
  const plName = new Map<string, string>(((levels ?? []) as { id: string; name: string }[]).map(d => [d.id, d.name]))

  const type = fStr(f, 'type'), status = fStr(f, 'status'), tier = fStr(f, 'tier'), country = fStr(f, 'country'), pl = fStr(f, 'priceLevel')
  const owing = fBool(f, 'owing')
  const cFrom = fStr(f, 'created_from'), cTo = fStr(f, 'created_to')

  const join = (...parts: unknown[]) => parts.map(p => (p ? String(p).trim() : '')).filter(Boolean).join(', ')
  const customLabels: string[] = [...idToName.values()]
  const out: Row[] = []
  for (const c of rows) {
    const active = c.is_active !== false && String(c.status ?? '').toLowerCase() !== 'inactive'
    const ctry = String(c.bill_country || c.country || '')
    if (type && c.type !== type) continue
    if (status === 'active' && !active) continue
    if (status === 'inactive' && active) continue
    if (tier && c.tier !== tier) continue
    if (pl && c.price_level_id !== pl) continue
    if (country && ctry !== country) continue
    if (owing && n0(c.balance_owing) <= 0) continue
    if (!inRange(ymd(c.created_at), cFrom, cTo)) continue
    const cv = customValues(c.custom_fields, idToName)
    for (const k of Object.keys(cv)) if (!customLabels.includes(k)) customLabels.push(k)
    const discPct = /pct|percent|%/i.test(String(c.disc_type ?? ''))
    const row: Row = {
      name: String(c.name ?? ''),
      type: c.type === 'supplier' ? 'Supplier' : 'Customer',
      status: active ? 'Active' : 'Inactive',
      email: (c.email as string) || null,
      phone: (c.phone as string) || null,
      tier: (c.tier as string) || null,
      terms: (c.terms as string) || null,
      currency: (c.currency as string) || null,
      tax_number: (c.tax_number as string) || null,
      credit_limit: c.credit_limit == null ? null : n0(c.credit_limit),
      balance_owing: n0(c.balance_owing),
      discount: n0(c.disc_value) > 0 ? `${n0(c.disc_value)}${discPct ? '%' : ''}` : null,
      price_level: c.price_level_id ? plName.get(String(c.price_level_id)) ?? null : null,
      country: ctry || null,
      billing: join(c.bill_street || c.address, c.bill_city || c.city, c.bill_postcode, c.bill_country) || null,
      shipping: join(c.ship_street, c.ship_city, c.ship_postcode, c.ship_country) || null,
      website: (c.website as string) || null,
      created: ymd(c.created_at) || null,
      notes: (c.notes as string) || null,
    }
    for (const [k, v] of Object.entries(cv)) row[`cf:${k}`] = v
    out.push(row)
  }
  const used = new Set(out.flatMap(r => Object.keys(r).filter(k => k.startsWith('cf:'))))
  const columns: Col[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'badge' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'tier', label: 'Tier', type: 'text' },
    { key: 'terms', label: 'Terms', type: 'text', off: true },
    { key: 'currency', label: 'Currency', type: 'text', off: true },
    { key: 'tax_number', label: 'Tax number', type: 'text', off: true },
    { key: 'credit_limit', label: 'Credit limit', type: 'money', off: true },
    { key: 'balance_owing', label: 'Balance owing', type: 'money', sum: true },
    { key: 'discount', label: 'Discount', type: 'text', off: true },
    { key: 'price_level', label: 'Price level', type: 'text', off: true },
    { key: 'country', label: 'Country', type: 'text', off: true },
    { key: 'billing', label: 'Billing address', type: 'text', off: true },
    { key: 'shipping', label: 'Shipping address', type: 'text', off: true },
    { key: 'website', label: 'Website', type: 'text', off: true },
    { key: 'created', label: 'Created', type: 'date', off: true },
    { key: 'notes', label: 'Notes', type: 'text', off: true },
    ...customLabels.filter(l => used.has(`cf:${l}`)).map(l => ({ key: `cf:${l}`, label: l, type: 'text' as const })),
  ]
  const customers = out.filter(r => r.type === 'Customer').length
  const tiles: Tile[] = [
    { label: 'Contacts', value: out.length, type: 'num' },
    { label: 'Customers', value: customers, type: 'num' },
    { label: 'Suppliers', value: out.length - customers, type: 'num' },
    { label: 'Balance owing', value: r2(out.reduce((s, r) => s + n0(r.balance_owing), 0)), type: 'money' },
  ]
  return { columns, rows: out, tiles, truncated }
}

// ───────────────────────────── Products
export async function productsReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const [{ rows, truncated }, { data: defs }, { data: taxes }, contacts] = await Promise.all([
    fetchAll<Record<string, unknown>>((a, b) => db.from('products').select('id, name, sku, barcode, description, unit, cost_price, sell_price, tax_rate, tags, is_active, track_stock, low_stock_threshold, type, supplier_code, lead_time_days, min_order_qty, default_supplier_id, serial_tracking, batch_tracking, expiry_tracking, notes, custom_fields, last_cost, avg_cost, sell_tax_rate_id, buy_tax_rate_id, created_at').eq('org_id', orgId).order('name').range(a, b)),
    db.from('product_custom_fields').select('id, name, sort_order').eq('org_id', orgId).order('sort_order'),
    db.from('tax_rates').select('id, name, rate').eq('org_id', orgId),
    loadContactsMap(db, orgId),
  ])
  const idToName = new Map<string, string>(((defs ?? []) as { id: string; name: string }[]).map(d => [d.id, d.name]))
  const taxName = new Map<string, string>(((taxes ?? []) as { id: string; name: string }[]).map(t => [t.id, t.name]))
  const type = fStr(f, 'type'), status = fStr(f, 'status'), sup = fStr(f, 'supplier'), tag = fStr(f, 'tag')
  const tracking = fArr(f, 'tracking')
  const pMin = fNum(f, 'priceMin'), pMax = fNum(f, 'priceMax')

  const customLabels: string[] = [...idToName.values()]
  const out: Row[] = []
  for (const p of rows) {
    const t = String(p.type ?? 'Stock')
    const active = p.is_active !== false
    if (type && t !== type) continue
    if (status === 'active' && !active) continue
    if (status === 'inactive' && active) continue
    if (sup && p.default_supplier_id !== sup) continue
    if (tag && !((p.tags as string[] | null) ?? []).some(x => x.toLowerCase() === tag.toLowerCase())) continue
    const sell = n0(p.sell_price)
    if (pMin !== null && sell < pMin) continue
    if (pMax !== null && sell > pMax) continue
    const trk = [p.batch_tracking && 'Batch', p.serial_tracking && 'Serial', p.expiry_tracking && 'Expiry'].filter(Boolean) as string[]
    if (tracking.length) {
      const ok = tracking.some(x => (x === 'none' ? trk.length === 0 : x === 'batch' ? !!p.batch_tracking : x === 'serial' ? !!p.serial_tracking : !!p.expiry_tracking))
      if (!ok) continue
    }
    const cv = customValues(p.custom_fields, idToName)
    for (const k of Object.keys(cv)) if (!customLabels.includes(k)) customLabels.push(k)
    const cost = n0(p.cost_price)
    const row: Row = {
      name: String(p.name ?? ''),
      sku: (p.sku as string) || null,
      barcode: (p.barcode as string) || null,
      type: t === 'NonStock' ? 'Non-stock' : t,
      status: active ? 'Active' : 'Inactive',
      unit: (p.unit as string) || null,
      cost_price: cost,
      last_cost: n0(p.last_cost) || null,
      avg_cost: n0(p.avg_cost) || null,
      sell_price: sell,
      margin: sell > 0 && cost > 0 ? r2(((sell - cost) / sell) * 100) : null,
      tax: p.sell_tax_rate_id ? taxName.get(String(p.sell_tax_rate_id)) ?? null : p.tax_rate != null ? `${n0(p.tax_rate)}%` : null,
      min_level: n0(p.low_stock_threshold) || null,
      supplier: p.default_supplier_id ? contacts.get(String(p.default_supplier_id))?.name ?? null : null,
      supplier_code: (p.supplier_code as string) || null,
      lead_time: p.lead_time_days == null ? null : n0(p.lead_time_days),
      moq: n0(p.min_order_qty) || null,
      tracking: trk.length ? trk.join(', ') : null,
      tags: ((p.tags as string[] | null) ?? []).join(', ') || null,
      description: (p.description as string) || null,
      created: ymd(p.created_at) || null,
    }
    for (const [k, v] of Object.entries(cv)) row[`cf:${k}`] = v
    out.push(row)
  }
  const used = new Set(out.flatMap(r => Object.keys(r).filter(k => k.startsWith('cf:'))))
  const columns: Col[] = [
    { key: 'name', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'barcode', label: 'Barcode', type: 'text', off: true },
    { key: 'type', label: 'Type', type: 'badge' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'cost_price', label: 'Cost price', type: 'money' },
    { key: 'last_cost', label: 'Last cost', type: 'money', off: true },
    { key: 'avg_cost', label: 'Average cost', type: 'money', off: true },
    { key: 'sell_price', label: 'Sell price', type: 'money' },
    { key: 'margin', label: 'Margin', type: 'pct' },
    { key: 'tax', label: 'Tax', type: 'text', off: true },
    { key: 'min_level', label: 'Minimum level', type: 'qty', off: true },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'supplier_code', label: 'Supplier code', type: 'text', off: true },
    { key: 'lead_time', label: 'Lead time (days)', type: 'num', off: true },
    { key: 'moq', label: 'Min order qty', type: 'qty', off: true },
    { key: 'tracking', label: 'Tracking', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'text', off: true },
    { key: 'description', label: 'Description', type: 'text', off: true },
    { key: 'created', label: 'Created', type: 'date', off: true },
    ...customLabels.filter(l => used.has(`cf:${l}`)).map(l => ({ key: `cf:${l}`, label: l, type: 'text' as const })),
  ]
  const count = (t: string) => out.filter(r => r.type === t).length
  const tiles: Tile[] = [
    { label: 'Products', value: out.length, type: 'num' },
    { label: 'Active', value: out.filter(r => r.status === 'Active').length, type: 'num' },
    { label: 'Stock items', value: count('Stock'), type: 'num' },
    { label: 'Non-stock & services', value: count('Non-stock') + count('Service'), type: 'num' },
  ]
  return { columns, rows: out, tiles, truncated }
}

// ───────────────────────────── Stock list
export async function stockListReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const loc = fStr(f, 'location'), level = fStr(f, 'level')
  const [{ list, map }, locs, lv] = await Promise.all([loadProducts(db, orgId), loadLocations(db, orgId), loadLevels(db, orgId, loc)])
  const rows: Row[] = []
  const seen = new Set<string>()
  for (const l of lv.rows) {
    const p = map.get(l.product_id)
    if (!isStocked(p) || !productPass(p, f)) continue
    seen.add(p!.id)
    const q = n0(l.quantity)
    rows.push(stockRow(p!, locs.get(l.location_id) ?? '—', q, n0(l.committed), n0(l.on_order)))
  }
  if (!loc) for (const p of list) if (isStocked(p) && !seen.has(p.id) && productPass(p, f)) rows.push(stockRow(p, '—', 0, 0, 0))
  const out = rows.filter(r => (level === 'in' ? n0(r.on_hand) > 0 : level === 'zero' ? n0(r.on_hand) === 0 : level === 'neg' ? n0(r.on_hand) < 0 : true))
  out.sort((a, b) => String(a.product).localeCompare(String(b.product)) || String(a.location).localeCompare(String(b.location)))
  const byProduct = new Map<string, number>()
  for (const r of out) byProduct.set(String(r.sku ?? r.product), (byProduct.get(String(r.sku ?? r.product)) ?? 0) + n0(r.on_hand))
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'unit', label: 'Unit', type: 'text', off: true },
    { key: 'on_hand', label: 'On hand', type: 'qty', sum: true },
    { key: 'committed', label: 'Committed', type: 'qty', sum: true },
    { key: 'available', label: 'Available', type: 'qty', sum: true },
    { key: 'on_order', label: 'On order', type: 'qty', sum: true },
    { key: 'cost', label: 'Unit cost', type: 'money', off: true },
    { key: 'value', label: 'Stock value', type: 'money', sum: true },
  ]
  const tiles: Tile[] = [
    { label: 'Products', value: byProduct.size, type: 'num' },
    { label: 'Units on hand', value: r4(out.reduce((s, r) => s + n0(r.on_hand), 0)), type: 'num' },
    { label: 'Stock value', value: r2(out.reduce((s, r) => s + n0(r.value), 0)), type: 'money', hint: 'at average cost' },
    { label: 'Out of stock', value: [...byProduct.values()].filter(v => v <= 0).length, type: 'num' },
  ]
  return { columns, rows: out, tiles, truncated: lv.truncated }
}

function stockRow(p: ProductLite, location: string, onHand: number, committed: number, onOrder: number): Row {
  const cost = costOf(p, 'avg')
  return {
    product: p.name, sku: p.sku, location, unit: p.unit, on_hand: r4(onHand), committed: r4(committed), available: r4(onHand - committed),
    on_order: r4(onOrder), cost: r2(cost), value: r2(onHand * cost),
  }
}

// ───────────────────────────── Stock valuation
export async function stockValuationReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const loc = fStr(f, 'location'), group = fStr(f, 'group') || 'both', basis = basisOf(fStr(f, 'basis'))
  const asAt = fStr(f, 'asAt'), hideZero = fBool(f, 'hideZero')
  const [{ map }, locs, lv, org] = await Promise.all([loadProducts(db, orgId), loadLocations(db, orgId), loadLevels(db, orgId, loc), loadOrg(db, orgId)])

  const qty = new Map<string, number>() // product|location → quantity
  for (const l of lv.rows) qty.set(`${l.product_id}|${l.location_id}`, n0(l.quantity))

  let truncated = lv.truncated
  if (asAt) {
    // wind back: take off every movement recorded after the end of that day
    const after = endOfDayUtc(asAt, org.tz)
    const mv = await fetchAll<{ product_id: string; location_id: string; qty: number }>((a, b) => {
      let q = db.from('stock_movements').select('product_id, location_id, qty').eq('org_id', orgId).gte('created_at', after)
      if (loc) q = q.eq('location_id', loc)
      return q.range(a, b)
    })
    truncated = truncated || mv.truncated
    for (const m of mv.rows) {
      const k = `${m.product_id}|${m.location_id}`
      qty.set(k, (qty.get(k) ?? 0) - n0(m.qty))
    }
  }

  type Line = { p: ProductLite; locId: string; q: number; cost: number; value: number }
  const lines: Line[] = []
  for (const [k, q] of qty) {
    const [pid, locId] = k.split('|')
    const p = map.get(pid)
    if (!isStocked(p) || !productPass(p, f)) continue
    if (hideZero && Math.abs(q) < 1e-9) continue
    const cost = costOf(p, basis)
    lines.push({ p: p!, locId, q, cost, value: q * cost })
  }
  const total = lines.reduce((s, l) => s + l.value, 0)
  const units = lines.reduce((s, l) => s + l.q, 0)

  let columns: Col[]
  let rows: Row[]
  if (group === 'location') {
    const agg = new Map<string, { products: Set<string>; q: number; v: number }>()
    for (const l of lines) {
      const a = agg.get(l.locId) ?? { products: new Set<string>(), q: 0, v: 0 }
      a.products.add(l.p.id); a.q += l.q; a.v += l.value
      agg.set(l.locId, a)
    }
    rows = [...agg.entries()].map(([id, a]) => ({ location: locs.get(id) ?? '—', products: a.products.size, units: r4(a.q), value: r2(a.v), share: pct(a.v, total) })).sort((a, b) => n0(b.value) - n0(a.value))
    columns = [
      { key: 'location', label: 'Location', type: 'text', required: true },
      { key: 'products', label: 'Products', type: 'num' },
      { key: 'units', label: 'Units', type: 'qty', sum: true },
      { key: 'value', label: 'Stock value', type: 'money', sum: true },
      { key: 'share', label: '% of value', type: 'pct' },
    ]
  } else if (group === 'product') {
    const agg = new Map<string, { p: ProductLite; q: number; v: number }>()
    for (const l of lines) {
      const a = agg.get(l.p.id) ?? { p: l.p, q: 0, v: 0 }
      a.q += l.q; a.v += l.value
      agg.set(l.p.id, a)
    }
    rows = [...agg.values()].map(a => ({ product: a.p.name, sku: a.p.sku, unit: a.p.unit, qty: r4(a.q), cost: r2(costOf(a.p, basis)), value: r2(a.v), share: pct(a.v, total) })).sort((a, b) => n0(b.value) - n0(a.value))
    columns = [
      { key: 'product', label: 'Product', type: 'text', required: true },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text', off: true },
      { key: 'qty', label: 'Quantity', type: 'qty', sum: true },
      { key: 'cost', label: 'Unit cost', type: 'money' },
      { key: 'value', label: 'Stock value', type: 'money', sum: true },
      { key: 'share', label: '% of value', type: 'pct' },
    ]
  } else {
    rows = lines.map(l => ({ product: l.p.name, sku: l.p.sku, location: locs.get(l.locId) ?? '—', unit: l.p.unit, qty: r4(l.q), cost: r2(l.cost), value: r2(l.value), share: pct(l.value, total) }))
      .sort((a, b) => n0(b.value) - n0(a.value))
    columns = [
      { key: 'product', label: 'Product', type: 'text', required: true },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text', off: true },
      { key: 'qty', label: 'Quantity', type: 'qty', sum: true },
      { key: 'cost', label: 'Unit cost', type: 'money' },
      { key: 'value', label: 'Stock value', type: 'money', sum: true },
      { key: 'share', label: '% of value', type: 'pct' },
    ]
  }
  const tiles: Tile[] = [
    { label: 'Total stock value', value: r2(total), type: 'money' },
    { label: 'Units on hand', value: r4(units), type: 'num' },
    { label: 'Products', value: new Set(lines.map(l => l.p.id)).size, type: 'num' },
    { label: 'Locations', value: new Set(lines.map(l => l.locId)).size, type: 'num' },
  ]
  const note = `Valued at ${BASIS_LABEL[basis]}${asAt ? `, as at ${asAt}` : ', as of now'}.`
  return { columns, rows, tiles, note, truncated }
}

// ───────────────────────────── Stock count sheet
export async function stockCountReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const loc = fStr(f, 'location'), binId = fStr(f, 'bin'), sort = fStr(f, 'sort') || 'bin', hideZero = fBool(f, 'hideZero')
  const [{ map }, locs, bins, lv, groups] = await Promise.all([loadProducts(db, orgId), loadLocations(db, orgId), loadBins(db, orgId), loadLevels(db, orgId, loc), loadGroups(db, orgId, loc)])
  const binName = binId ? bins.get(binId)?.name ?? '' : ''

  const byKey = new Map<string, Group[]>()
  for (const g of groups) { const k = `${g.product_id}|${g.location_id}`; byKey.set(k, [...(byKey.get(k) ?? []), g]) }

  const out: Row[] = []
  const add = (p: ProductLite, locId: string, bin: string | null, batch: string | null, serial: string | null, expiry: string | null, q: number) => {
    if (hideZero && q <= 0) return
    out.push({ bin: bin || '—', sku: p.sku, product: p.name, location: locs.get(locId) ?? '—', batch, serial, expiry: expiry ? ymd(expiry) : null, qty: r4(q), counted: null, variance: null })
  }
  for (const l of lv.rows) {
    const p = map.get(l.product_id)
    if (!isStocked(p) || !productPass(p, f)) continue
    const gs = byKey.get(`${l.product_id}|${l.location_id}`) ?? []
    let grouped = 0
    for (const g of gs) {
      grouped += n0(g.quantity)
      add(p!, l.location_id, g.bin_id ? bins.get(g.bin_id)?.name ?? null : null, g.batch_number, g.serial_number, g.expiry_date, n0(g.quantity))
    }
    const loose = n0(l.quantity) - grouped
    if (gs.length === 0 || loose > 0) add(p!, l.location_id, l.bin, null, null, null, gs.length === 0 ? n0(l.quantity) : loose)
  }
  const rows = out.filter(r => !binName || r.bin === binName)
  const cmp = (a: Row, b: Row, k: string) => String(a[k] ?? '').localeCompare(String(b[k] ?? ''), undefined, { numeric: true })
  rows.sort((a, b) => (sort === 'sku' ? cmp(a, b, 'sku') : sort === 'name' ? cmp(a, b, 'product') : cmp(a, b, 'location') || cmp(a, b, 'bin') || cmp(a, b, 'product')))
  const columns: Col[] = [
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'bin', label: 'Bin', type: 'text' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'batch', label: 'Batch', type: 'text', off: true },
    { key: 'serial', label: 'Serial', type: 'text', off: true },
    { key: 'expiry', label: 'Expiry', type: 'date', off: true },
    { key: 'qty', label: 'System qty', type: 'qty', sum: true },
    { key: 'counted', label: 'Counted', type: 'blank', required: true },
    { key: 'variance', label: 'Variance', type: 'blank', off: true },
  ]
  const tiles: Tile[] = [
    { label: 'Lines to count', value: rows.length, type: 'num' },
    { label: 'Products', value: new Set(rows.map(r => r.sku ?? r.product)).size, type: 'num' },
    { label: 'Units expected', value: r4(rows.reduce((s, r) => s + n0(r.qty), 0)), type: 'num' },
  ]
  return { columns, rows, tiles, note: 'Print this sheet and write the counted quantity in the Counted column.', truncated: lv.truncated }
}

// ───────────────────────────── Minimum level alerts
export async function minLevelReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const loc = fStr(f, 'location'), mode = fStr(f, 'mode') || 'below'
  const pc = fNum(f, 'pct') ?? 10
  const [{ list }, lv, contacts] = await Promise.all([loadProducts(db, orgId), loadLevels(db, orgId, loc), loadContactsMap(db, orgId)])
  const tot = new Map<string, { onHand: number; onOrder: number; committed: number }>()
  for (const l of lv.rows) {
    const t = tot.get(l.product_id) ?? { onHand: 0, onOrder: 0, committed: 0 }
    t.onHand += n0(l.quantity); t.onOrder += n0(l.on_order); t.committed += n0(l.committed)
    tot.set(l.product_id, t)
  }
  const out: Row[] = []
  for (const p of list) {
    const min = n0(p.low_stock_threshold)
    if (!isStocked(p) || min <= 0 || p.is_active === false || !productPass(p, f)) continue
    const t = tot.get(p.id) ?? { onHand: 0, onOrder: 0, committed: 0 }
    const oh = t.onHand
    const flagged = mode === 'all' ? true : mode === 'out' ? oh <= 0 : mode === 'below' ? oh < min : mode === 'below_pct' ? oh <= min * (1 - pc / 100) : oh <= min * (1 + pc / 100)
    if (!flagged) continue
    const status = oh <= 0 ? 'Out of stock' : oh < min ? 'Below minimum' : oh <= min * 1.1 ? 'Near minimum' : 'OK'
    const need = Math.max(min - oh - t.onOrder, 0)
    const moq = n0(p.min_order_qty)
    const reorder = need > 0 ? Math.max(need, moq) : 0
    out.push({
      product: p.name, sku: p.sku, unit: p.unit, on_hand: r4(oh), available: r4(oh - t.committed), on_order: r4(t.onOrder), min: r4(min),
      shortfall: r4(Math.max(min - oh, 0)), of_min: pct(oh, min), status, reorder: r4(reorder),
      reorder_cost: r2(reorder * costOf(p, 'std')), supplier: p.default_supplier_id ? contacts.get(p.default_supplier_id)?.name ?? null : null, lead_time: p.lead_time_days == null ? null : n0(p.lead_time_days),
    })
  }
  out.sort((a, b) => n0(a.of_min) - n0(b.of_min))
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'on_hand', label: 'On hand', type: 'qty', sum: true },
    { key: 'available', label: 'Available', type: 'qty', off: true },
    { key: 'on_order', label: 'On order', type: 'qty', sum: true },
    { key: 'min', label: 'Minimum', type: 'qty', sum: true },
    { key: 'shortfall', label: 'Shortfall', type: 'qty', sum: true },
    { key: 'of_min', label: '% of minimum', type: 'pct' },
    { key: 'reorder', label: 'Suggested reorder', type: 'qty', sum: true },
    { key: 'reorder_cost', label: 'Est. reorder cost', type: 'money', sum: true },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'lead_time', label: 'Lead time (days)', type: 'num', off: true },
    { key: 'unit', label: 'Unit', type: 'text', off: true },
  ]
  const tiles: Tile[] = [
    { label: 'Products flagged', value: out.length, type: 'num' },
    { label: 'Out of stock', value: out.filter(r => r.status === 'Out of stock').length, type: 'num' },
    { label: 'Below minimum', value: out.filter(r => r.status === 'Below minimum').length, type: 'num' },
    { label: 'Est. reorder cost', value: r2(out.reduce((s, r) => s + n0(r.reorder_cost), 0)), type: 'money' },
  ]
  return { columns, rows: out, tiles, note: 'Suggested reorder = minimum − on hand − already on order, rounded up to the minimum order quantity.', truncated: lv.truncated }
}

// ───────────────────────────── Expiry dates
export async function expiryReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const loc = fStr(f, 'location'), win = fStr(f, 'window') || '90', prod = fStr(f, 'product'), inclExpired = f.inclExpired !== false
  const rFrom = fStr(f, 'range_from'), rTo = fStr(f, 'range_to')
  const [{ map }, locs, bins, groups, org] = await Promise.all([loadProducts(db, orgId), loadLocations(db, orgId), loadBins(db, orgId), loadGroups(db, orgId, loc), loadOrg(db, orgId)])
  const today = todayIn(org.tz)
  const out: Row[] = []
  for (const g of groups) {
    if (!g.expiry_date) continue
    const p = map.get(g.product_id)
    if (!p || (prod && p.id !== prod)) continue
    const exp = ymd(g.expiry_date)
    const left = daysBetween(today, exp)
    if (win === 'expired') { if (left >= 0) continue }
    else if (win === 'custom') { if (!inRange(exp, rFrom, rTo)) continue }
    else if (win !== 'all') {
      const n = Number(win)
      if (left > n) continue
      if (left < 0 && !inclExpired) continue
    }
    const cost = costOf(p, 'avg')
    out.push({
      product: p.name, sku: p.sku, location: locs.get(g.location_id) ?? '—', bin: g.bin_id ? bins.get(g.bin_id)?.name ?? null : null,
      batch: g.batch_number, serial: g.serial_number, expiry: exp, days: left, qty: r4(n0(g.quantity)), value: r2(n0(g.quantity) * cost),
      status: left < 0 ? 'Expired' : left <= 30 ? 'Expiring soon' : 'OK',
    })
  }
  out.sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)))
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'expiry', label: 'Expiry date', type: 'date' },
    { key: 'days', label: 'Days left', type: 'num' },
    { key: 'batch', label: 'Batch', type: 'text' },
    { key: 'serial', label: 'Serial', type: 'text', off: true },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'bin', label: 'Bin', type: 'text', off: true },
    { key: 'qty', label: 'Quantity', type: 'qty', sum: true },
    { key: 'value', label: 'Value', type: 'money', sum: true },
  ]
  const exp = out.filter(r => r.status === 'Expired')
  const soon = out.filter(r => r.status === 'Expiring soon')
  const tiles: Tile[] = [
    { label: 'Batches listed', value: out.length, type: 'num' },
    { label: 'Expired', value: r4(exp.reduce((s, r) => s + n0(r.qty), 0)), type: 'num', hint: 'units' },
    { label: 'Expiring within 30 days', value: r4(soon.reduce((s, r) => s + n0(r.qty), 0)), type: 'num', hint: 'units' },
    { label: 'Value listed', value: r2(out.reduce((s, r) => s + n0(r.value), 0)), type: 'money' },
  ]
  return { columns, rows: out, tiles, note: 'Only products with expiry tracking and stock on hand appear here.' }
}

// ───────────────────────────── Inventory ageing
export async function ageingReport(db: Db, orgId: string, f: Filters): Promise<ReportResult> {
  const loc = fStr(f, 'location'), basis = basisOf(fStr(f, 'basis')), minAge = fNum(f, 'minAge')
  const bands = (fStr(f, 'bands') || '30,60,90').split(',').map(Number)
  const [{ map }, locs, lv, org] = await Promise.all([loadProducts(db, orgId), loadLocations(db, orgId), loadLevels(db, orgId, loc), loadOrg(db, orgId)])
  const mv = await fetchAll<{ product_id: string; location_id: string; qty: number; created_at: string }>((a, b) => {
    let q = db.from('stock_movements').select('product_id, location_id, qty, created_at').eq('org_id', orgId).gt('qty', 0).order('created_at', { ascending: false })
    if (loc) q = q.eq('location_id', loc)
    return q.range(a, b)
  })
  const inbound = new Map<string, { qty: number; day: string }[]>()
  for (const m of mv.rows) {
    const k = `${m.product_id}|${m.location_id}`
    const arr = inbound.get(k) ?? []
    arr.push({ qty: n0(m.qty), day: dayIn(m.created_at, org.tz) })
    inbound.set(k, arr)
  }
  const today = todayIn(org.tz)
  const labels = [`0–${bands[0]} days`, `${bands[0] + 1}–${bands[1]} days`, `${bands[1] + 1}–${bands[2]} days`, `${bands[2]}+ days`]
  const bucketOf = (age: number) => (age <= bands[0] ? 0 : age <= bands[1] ? 1 : age <= bands[2] ? 2 : 3)

  const out: Row[] = []
  for (const l of lv.rows) {
    const p = map.get(l.product_id)
    const onHand = n0(l.quantity)
    if (!isStocked(p) || !productPass(p, f) || onHand <= 0) continue
    const cost = costOf(p, basis)
    const b = [0, 0, 0, 0, 0] // qty per band + undated
    let remaining = onHand, oldest = 0
    // the stock on hand is the most recent receipts, so walk back from newest until it is all accounted for
    for (const r of inbound.get(`${l.product_id}|${l.location_id}`) ?? []) {
      if (remaining <= 0) break
      const take = Math.min(remaining, r.qty)
      const age = Math.max(daysBetween(r.day, today), 0)
      b[bucketOf(age)] += take
      oldest = Math.max(oldest, age)
      remaining -= take
    }
    if (remaining > 0.0000001) b[4] += remaining
    if (minAge !== null && oldest <= minAge && b[4] <= 0) continue
    out.push({
      product: p!.name, sku: p!.sku, location: locs.get(l.location_id) ?? '—', on_hand: r4(onHand), cost: r2(cost),
      b1: r2(b[0] * cost), b2: r2(b[1] * cost), b3: r2(b[2] * cost), b4: r2(b[3] * cost), und: r2(b[4] * cost),
      value: r2(onHand * cost), oldest,
    })
  }
  out.sort((a, b) => n0(b.value) - n0(a.value))
  const hasUndated = out.some(r => n0(r.und) > 0)
  const columns: Col[] = [
    { key: 'product', label: 'Product', type: 'text', required: true },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'on_hand', label: 'On hand', type: 'qty', sum: true },
    { key: 'cost', label: 'Unit cost', type: 'money', off: true },
    { key: 'b1', label: labels[0], type: 'money', sum: true },
    { key: 'b2', label: labels[1], type: 'money', sum: true },
    { key: 'b3', label: labels[2], type: 'money', sum: true },
    { key: 'b4', label: labels[3], type: 'money', sum: true },
    ...(hasUndated ? [{ key: 'und', label: 'No receipt date', type: 'money' as const, sum: true }] : []),
    { key: 'value', label: 'Total value', type: 'money', sum: true },
    { key: 'oldest', label: 'Oldest (days)', type: 'num' },
  ]
  const total = out.reduce((s, r) => s + n0(r.value), 0)
  const oldVal = out.reduce((s, r) => s + n0(r.b4), 0)
  const tiles: Tile[] = [
    { label: 'Total stock value', value: r2(total), type: 'money' },
    { label: `Older than ${bands[2]} days`, value: r2(oldVal), type: 'money' },
    { label: 'Share of value that is old', value: pct(oldVal, total), type: 'pct' },
    { label: 'Lines', value: out.length, type: 'num' },
  ]
  return {
    columns, rows: out, tiles, truncated: lv.truncated || mv.truncated,
    note: `Age is counted from when each unit arrived (newest receipts are assumed to be what is on the shelf). Valued at ${BASIS_LABEL[basis]}.`,
  }
}
