// src/lib/transfer-pick-data.ts
// Loads everything the Pick screen needs for one or several transfers.
// Stock is picked at the FROM location. Stock with the same bin / batch / serial / expiry is merged into one row.
// Stock reserved by other transfers AND by sales orders is excluded. A line with a From Bin only offers that bin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type PartOut = { group_id: string | null; available: number }
type StockOut = {
  key: string; bin: string | null; batch: string | null; serial: string | null; expiry: string | null
  created_at: string; parts: PartOut[]
}

export async function loadTransferPickData(db: Db, orgId: string, ids: string[], allowedStatuses: string[]) {
  const { data: rows } = await db
    .from('transfer_orders')
    .select(`
      id, tr_number, status, from_location_id, from_location_name, to_location_id, to_location_name, created_at,
      transfer_order_lines ( id, product_id, product_name, product_sku, unit, quantity, quantity_picked, from_bin_id, sort_order )
    `)
    .eq('org_id', orgId)
    .in('id', ids)

  type L = { id: string; product_id: string | null; product_name: string | null; product_sku: string | null; unit: string | null; quantity: number; quantity_picked: number | null; from_bin_id: string | null; sort_order: number | null }
  type O = { id: string; tr_number: string | null; status: string; from_location_id: string | null; from_location_name: string | null; to_location_id: string | null; to_location_name: string | null; created_at: string; transfer_order_lines: L[] | null }

  const all = (rows ?? []) as O[]
  const orders = ids
    .map(i => all.find(o => o.id === i))
    .filter((o): o is O => !!o && allowedStatuses.includes(String(o.status).toLowerCase()) && !!o.from_location_id)

  const productIds = [...new Set(orders.flatMap(o => (o.transfer_order_lines ?? []).map(l => l.product_id)).filter((x): x is string => !!x))]
  const locationIds = [...new Set(orders.map(o => o.from_location_id as string))]
  const onScreen = new Set(orders.map(o => o.id))

  const empty = Promise.resolve({ data: [] })
  const [{ data: products }, { data: levels }, { data: groups }, { data: bins }, { data: trPicks }, { data: soPicks }] = await Promise.all([
    productIds.length ? db.from('products').select('id, batch_tracking, serial_tracking, expiry_tracking').in('id', productIds) : empty,
    productIds.length ? db.from('stock_levels').select('product_id, location_id, quantity').eq('org_id', orgId).in('location_id', locationIds).in('product_id', productIds) : empty,
    productIds.length ? db.from('stock_groups').select('id, product_id, location_id, bin_id, batch_number, serial_number, expiry_date, quantity, created_at')
      .eq('org_id', orgId).in('location_id', locationIds).in('product_id', productIds).gt('quantity', 0) : empty,
    db.from('bins').select('id, name').eq('org_id', orgId).in('location_id', locationIds),
    productIds.length ? db.from('transfer_order_picks').select('tr_id, tr_line_id, product_id, location_id, stock_group_id, qty').eq('org_id', orgId).in('location_id', locationIds).in('product_id', productIds) : empty,
    productIds.length ? db.from('sales_order_picks').select('product_id, location_id, stock_group_id, qty').eq('org_id', orgId).in('location_id', locationIds).in('product_id', productIds) : empty,
  ])

  type P = { id: string; batch_tracking: boolean | null; serial_tracking: boolean | null; expiry_tracking: boolean | null }
  type G = { id: string; product_id: string; location_id: string; bin_id: string | null; batch_number: string | null; serial_number: string | null; expiry_date: string | null; quantity: number; created_at: string }
  type K = { tr_id: string; tr_line_id: string; product_id: string; location_id: string; stock_group_id: string | null; qty: number }
  const prodMap = new Map(((products ?? []) as P[]).map(p => [p.id, p]))
  const binName = new Map(((bins ?? []) as { id: string; name: string }[]).map(b => [b.id, b.name]))
  const onHand = new Map<string, number>()
  for (const s of (levels ?? []) as { product_id: string; location_id: string; quantity: number }[]) {
    const k = `${s.product_id}|${s.location_id}`
    onHand.set(k, (onHand.get(k) ?? 0) + Number(s.quantity || 0))
  }
  const myPicks = (trPicks ?? []) as K[]
  const othersOnGroup = new Map<string, number>()
  const othersUntracked = new Map<string, number>()
  const reserve = (k: { stock_group_id: string | null; product_id: string; location_id: string; qty: number }) => {
    if (k.stock_group_id) othersOnGroup.set(k.stock_group_id, (othersOnGroup.get(k.stock_group_id) ?? 0) + Number(k.qty))
    else {
      const key = `${k.product_id}|${k.location_id}`
      othersUntracked.set(key, (othersUntracked.get(key) ?? 0) + Number(k.qty))
    }
  }
  for (const k of myPicks) if (!onScreen.has(k.tr_id)) reserve(k)
  for (const k of (soPicks ?? []) as { stock_group_id: string | null; product_id: string; location_id: string; qty: number }[]) reserve(k)

  const stockCache = new Map<string, StockOut[]>()
  function stockFor(productId: string, locationId: string): StockOut[] {
    const ck = `${productId}|${locationId}`
    const hit = stockCache.get(ck)
    if (hit) return hit
    const gs = ((groups ?? []) as G[]).filter(g => g.product_id === productId && g.location_id === locationId)
    const out = new Map<string, StockOut>()
    const add = (attrs: { bin: string | null; batch: string | null; serial: string | null; expiry: string | null }, created: string, part: PartOut) => {
      if (part.available <= 0) return
      const key = [attrs.bin ?? '', attrs.batch ?? '', attrs.serial ?? '', attrs.expiry ?? ''].join('|')
      const row = out.get(key) ?? { key, ...attrs, created_at: created, parts: [] }
      row.parts.push(part)
      if (created && (!row.created_at || created < row.created_at)) row.created_at = created
      out.set(key, row)
    }
    for (const g of gs) {
      add(
        { bin: g.bin_id ? (binName.get(g.bin_id) ?? null) : null, batch: g.batch_number, serial: g.serial_number, expiry: g.expiry_date },
        g.created_at,
        { group_id: g.id, available: Math.max(Number(g.quantity) - (othersOnGroup.get(g.id) ?? 0), 0) },
      )
    }
    const grouped = gs.reduce((s, g) => s + Number(g.quantity), 0)
    const loose = Math.max((onHand.get(ck) ?? 0) - grouped - (othersUntracked.get(ck) ?? 0), 0)
    add({ bin: null, batch: null, serial: null, expiry: null }, '', { group_id: null, available: loose })
    const list = [...out.values()]
    for (const r of list) r.parts.sort((a, b) => (a.group_id === null ? 1 : 0) - (b.group_id === null ? 1 : 0))
    stockCache.set(ck, list)
    return list
  }

  const lines = orders.flatMap(o =>
    [...(o.transfer_order_lines ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .filter(l => !!l.product_id && prodMap.has(l.product_id) && Number(l.quantity) > 0)
      .map(l => {
        const p = prodMap.get(l.product_id as string) as P
        const locId = o.from_location_id as string
        let stock = stockFor(l.product_id as string, locId)
        // a line moving out of a specific bin can only be picked from that bin
        if (l.from_bin_id) {
          const bn = binName.get(l.from_bin_id)
          stock = stock.filter(s => s.bin !== null && s.bin === bn)
        }
        const mine = myPicks.filter(k => k.tr_line_id === l.id)
        return {
          id: l.id,
          order_id: o.id,
          product_id: l.product_id as string,
          location_id: locId,
          name: l.product_name ?? '',
          sku: l.product_sku ?? '',
          unit: l.unit ?? 'Each',
          ordered: Number(l.quantity),
          onHand: stock.reduce((s, r) => s + r.parts.reduce((t, x) => t + x.available, 0), 0) + mine.reduce((s, k) => s + Number(k.qty), 0),
          tracking: { batch: !!p.batch_tracking, serial: !!p.serial_tracking, expiry: !!p.expiry_tracking },
          stock,
          picks: mine.map(k => ({ group_id: k.stock_group_id, qty: Number(k.qty) })),
          legacyPicked: 0,
        }
      }),
  )

  return {
    orders: orders.map(o => ({
      id: o.id,
      so_number: o.tr_number ?? '',
      customer_name: `${o.from_location_name ?? ''} → ${o.to_location_name ?? ''}`,
      location_name: o.from_location_name ?? '',
      status: o.status,
    })),
    lines,
  }
}

export const TR_PICK_OPEN = ['open']
export const TR_PICK_ANY = ['open', 'picking', 'picked']
