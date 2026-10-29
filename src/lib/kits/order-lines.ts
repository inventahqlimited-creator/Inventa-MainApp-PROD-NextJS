// src/lib/kits/order-lines.ts
// How a kit sits on an order (sales, purchases and transfers).
//   • The kit is a line of its own (is_kit_parent). Its items follow as lines in the same kit_group — they carry the stock movement.
//   • An item's quantity = quantity-per-kit × the kit's quantity. Changing the kit quantity recalculates its items.
//   • Sales: the kit line carries the price; items have none. The order total is the kit price × quantity.
//   • Purchases: the items are priced from their own costs. Transfers: quantities only.
//   • On purchases and transfers the kit line is a heading only: it holds no quantity of its own (so receiving, picking and totals never
//     count it) and the number of kits is kept in kit_qty.
//   • If a screen shows the kit only (Settings → Kits & Bundles), the item lines are still stored so stock is still taken.
import { productCost } from './bom'
import type { KitSettings } from './settings'

export type KitComponent = {
  product_id: string; name: string; sku: string | null; unit: string | null; quantity: number; cost: number
  /** the item's buying tax (purchase orders) */
  tax?: { id: string | null; name: string | null; rate: number }
}
export type KitCatalog = Record<string, { components: KitComponent[] }>
/** Everything an order screen needs about kits: is the add-on on, the settings, and each kit's items. */
export type KitScreenData = { enabled: boolean; settings: KitSettings; catalog: KitCatalog }

/** Which kind of order the lines belong to — decides the quantity field and what is priced */
export type OrderKind = 'sales' | 'purchase' | 'transfer'
const QTY_KEY: Record<OrderKind, string> = { sales: 'quantity', purchase: 'quantity_ordered', transfer: 'quantity' }
export const qtyKeyFor = (k: OrderKind) => QTY_KEY[k]

type Line = Record<string, unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Quantity of an item for a given kit quantity */
export const childQty = (per: number, parentQty: number) => r4(per * parentQty)

/** Cost of one kit from its items (snapshot stored on the kit line when it is sold) */
export const kitUnitCost = (components: KitComponent[]) => r2(components.reduce((t, c) => t + c.quantity * c.cost, 0))

export const componentCost = (p: { avg_cost?: unknown; last_cost?: unknown; cost_price?: unknown }) => productCost(p)

/** The item lines for a kit. Each shares the kit's group. Sales: no price. Purchases: the item's own cost and tax. Transfers: quantities only. */
export function buildChildren(kitId: string, group: string, parentQty: number, catalog: KitCatalog, kind: OrderKind = 'sales'): Line[] {
  const qk = QTY_KEY[kind]
  return (catalog[kitId]?.components ?? []).map(c => {
    const base: Line = {
      product_id: c.product_id, product_name: c.name, product_sku: c.sku ?? '', unit: c.unit ?? 'Each',
      [qk]: childQty(c.quantity, parentQty), line_notes: '',
      kit_group: group, is_kit_parent: false, kit_qty_per: c.quantity,
    }
    if (kind === 'sales') Object.assign(base, { unit_price: 0, discount: 0, tax_rate: 0, tax_rate_id: null, tax_name: null })
    if (kind === 'purchase') Object.assign(base, { unit_cost: c.cost, discount: 0, tax_rate: c.tax?.rate ?? 0, tax_rate_id: c.tax?.id ?? null, tax_name: c.tax?.name ?? null })
    return base
  })
}

export type ResolveResult = { ok: true; lines: Line[] } | { ok: false; error: string }

/**
 * Checks and completes the kit lines sent with an order.
 *  - a line whose product is a kit becomes a kit line (group assigned); its items are the ones sent, or the saved ones, or the Bill of Materials
 *  - an item line must belong to a kit line on the order and be in that kit's Bill of Materials, with a quantity above zero
 * The quantity of a kit line is read from the order's quantity field as sent by the screen (the number of kits).
 */
export function resolveKitLines(opts: {
  incoming: Line[]
  catalog: KitCatalog
  /** items already saved on this order (edit), keyed by kit_group — kept when the screen sent the kit only */
  existingChildren?: Record<string, Line[]>
  newGroup: () => string
  kind?: OrderKind
}): ResolveResult {
  const { incoming, catalog, newGroup } = opts
  const kind: OrderKind = opts.kind ?? 'sales'
  const qk = QTY_KEY[kind]
  const existing = opts.existingChildren ?? {}
  const isKit = (l: Line) => typeof l.product_id === 'string' && !!catalog[l.product_id]

  // 1. kit lines and their groups
  const groupOf = new Map<Line, string>()
  const kitByGroup = new Map<string, Line>()
  for (const l of incoming) {
    if (!isKit(l)) continue
    const g = typeof l.kit_group === 'string' && UUID.test(l.kit_group) && !kitByGroup.has(l.kit_group) ? l.kit_group : newGroup()
    groupOf.set(l, g); kitByGroup.set(g, l)
  }

  // 2. item lines sent by the screen
  const sent = new Map<string, Line[]>()
  for (const l of incoming) {
    if (isKit(l)) continue
    const g = typeof l.kit_group === 'string' ? l.kit_group : null
    if (!g) continue
    const parent = kitByGroup.get(g)
    if (!parent) return { ok: false, error: 'A kit on this order has changed. Remove the kit line and add it again.' }
    const bom = catalog[parent.product_id as string].components
    const comp = bom.find(c => c.product_id === l.product_id)
    if (!comp) return { ok: false, error: `“${String(l.product_name ?? 'An item')}” is not part of the kit “${String(parent.product_name ?? '')}”.` }
    const q = num(l[qk])
    if (!(q > 0)) return { ok: false, error: `Enter a quantity above zero for “${comp.name}” in the kit “${String(parent.product_name ?? '')}”.` }
    const pq = num(parent[qk])
    const per = num(l.kit_qty_per) > 0 ? num(l.kit_qty_per) : pq > 0 ? r4(q / pq) : comp.quantity
    const arr = sent.get(g) ?? []
    arr.push({
      ...l, [qk]: q,
      ...(kind === 'sales' ? { unit_price: 0, discount: 0, tax_rate: 0, tax_rate_id: null, tax_name: null } : {}),
      kit_group: g, is_kit_parent: false, kit_qty_per: per,
    })
    sent.set(g, arr)
  }

  // 3. assemble in order: each kit line followed by its items
  const out: Line[] = []
  for (const l of incoming) {
    if (!isKit(l)) { if (!l.kit_group) out.push(l); continue }
    const g = groupOf.get(l)!
    const pq = num(l[qk])
    const parent: Line = { ...l, kit_group: g, is_kit_parent: true, kit_qty_per: null }
    if (kind === 'sales' && !l.id) parent.kit_unit_cost = kitUnitCost(catalog[l.product_id as string].components)
    if (kind !== 'sales') { parent.kit_qty = pq; parent[qk] = 0 }
    if (kind === 'purchase') Object.assign(parent, { unit_cost: 0, discount: 0, tax_rate: 0, tax_rate_id: null, tax_name: null })
    out.push(parent)
    let kids = sent.get(g)
    if (!kids) {
      const saved = typeof l.kit_group === 'string' ? existing[l.kit_group] : undefined
      kids = saved && saved.length
        ? saved.map(k => ({ ...k, kit_group: g, is_kit_parent: false, [qk]: num(k.kit_qty_per) > 0 ? childQty(num(k.kit_qty_per), pq) : num(k[qk]) }))
        : buildChildren(l.product_id as string, g, pq, catalog, kind)
    }
    out.push(...kids)
  }
  return { ok: true, lines: out }
}

// ── Screen helpers (purchase orders and transfers; the sales screen has its own copy of this logic) ──
/* eslint-disable @typescript-eslint/no-explicit-any */
export type KitUi = { catalog: KitCatalog; expand: boolean; kind: OrderKind }
type Decorate = (child: any, comp: KitComponent) => any

const isItem = (l: any) => !!l.kit_group && !l.is_kit_parent

/** A new kit line (its quantity is the number of kits) followed by its item lines when the screen shows them */
export function kitLinesFor(kitId: string, parent: any, ui: KitUi, decorate?: Decorate): any[] {
  const group = parent.kit_group ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()))
  const qk = QTY_KEY[ui.kind]
  const out: any[] = [{ ...parent, kit_group: group, is_kit_parent: true }]
  if (ui.expand) {
    const comps = ui.catalog[kitId]?.components ?? []
    buildChildren(kitId, group, num(parent[qk]), ui.catalog, ui.kind).forEach((k, i) => out.push(decorate ? decorate(k, comps[i]) : k))
  }
  return out
}

/** Gives kit lines on a loaded / cloned order their items, and hides the items when settings say to show the kit only */
export function arrangeKitLines(list: any[], ui: KitUi, decorate?: Decorate): any[] {
  const out: any[] = []
  for (const l of list) {
    if (isItem(l)) { if (ui.expand) out.push(l); continue }
    if (!ui.catalog[l.product_id]) { out.push(l); continue }
    const group = l.kit_group ?? crypto.randomUUID()
    const hasItems = list.some(x => x.kit_group === group && !x.is_kit_parent)
    if (hasItems) out.push({ ...l, kit_group: group, is_kit_parent: true })
    else out.push(...kitLinesFor(l.product_id, { ...l, kit_group: group }, ui, decorate))
  }
  return out
}

/** After a quantity edit on line idx: a kit's items follow the new kit quantity; an item's change is remembered as its quantity per kit */
export function kitApplyQty(lines: any[], idx: number, qty: number, kind: OrderKind): any[] {
  const qk = QTY_KEY[kind]
  const edited = lines[idx]
  if (!edited?.kit_group) return lines
  if (edited.is_kit_parent) {
    return lines.map(l => (l.kit_group === edited.kit_group && !l.is_kit_parent && num(l.kit_qty_per) > 0 ? { ...l, [qk]: childQty(num(l.kit_qty_per), qty) } : l))
  }
  const parent = lines.find(l => l.kit_group === edited.kit_group && l.is_kit_parent)
  if (parent && num(parent[qk]) > 0) return lines.map((l, i) => (i === idx ? { ...l, kit_qty_per: r4(qty / num(parent[qk])) } : l))
  return lines
}

/** Removing a kit line removes its items too */
export function kitRemove(lines: any[], idx: number): any[] {
  const gone = lines[idx]
  return gone?.is_kit_parent && gone.kit_group ? lines.filter(l => l.kit_group !== gone.kit_group) : lines.filter((_, i) => i !== idx)
}
