// src/lib/kits/order-lines.ts
// How a kit sits on an order (sales now; purchases and transfers reuse this).
//   • The kit is a normal priced line (is_kit_parent). Its items follow as lines in the same kit_group at $0 — they carry the stock movement.
//   • An item's quantity = quantity-per-kit × the kit's quantity. Changing the kit quantity recalculates its items.
//   • Item prices are never used on the order: the order total is the kit price × quantity.
//   • If a screen shows the kit only (Settings → Kits & Bundles), the item lines are still stored so stock is still taken.
import { productCost } from './bom'
import type { KitSettings } from './settings'

export type KitComponent = { product_id: string; name: string; sku: string | null; unit: string | null; quantity: number; cost: number }
export type KitCatalog = Record<string, { components: KitComponent[] }>
/** Everything an order screen needs about kits: is the add-on on, the settings, and each kit's items. */
export type KitScreenData = { enabled: boolean; settings: KitSettings; catalog: KitCatalog }
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

/** The item lines for a kit line. Each shares the kit's group and has no price, discount or tax. */
export function buildChildren(kitId: string, group: string, parentQty: number, catalog: KitCatalog): Line[] {
  return (catalog[kitId]?.components ?? []).map(c => ({
    product_id: c.product_id, product_name: c.name, product_sku: c.sku ?? '', unit: c.unit ?? 'Each',
    quantity: childQty(c.quantity, parentQty), unit_price: 0, discount: 0, tax_rate: 0, tax_rate_id: null, tax_name: null, line_notes: '',
    kit_group: group, is_kit_parent: false, kit_qty_per: c.quantity,
  }))
}

export type ResolveResult = { ok: true; lines: Line[] } | { ok: false; error: string }

/**
 * Checks and completes the kit lines sent with an order.
 *  - a line whose product is a kit becomes a kit line (group assigned); its items are the ones sent, or the saved ones, or the Bill of Materials
 *  - an item line must belong to a kit line on the order and be in that kit's Bill of Materials, with a quantity above zero
 */
export function resolveKitLines(opts: {
  incoming: Line[]
  catalog: KitCatalog
  /** items already saved on this order (edit), keyed by kit_group — kept when the screen sent the kit only */
  existingChildren?: Record<string, Line[]>
  newGroup: () => string
}): ResolveResult {
  const { incoming, catalog, newGroup } = opts
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
    const q = num(l.quantity)
    if (!(q > 0)) return { ok: false, error: `Enter a quantity above zero for “${comp.name}” in the kit “${String(parent.product_name ?? '')}”.` }
    const pq = num(parent.quantity)
    const per = num(l.kit_qty_per) > 0 ? num(l.kit_qty_per) : pq > 0 ? r4(q / pq) : comp.quantity
    const arr = sent.get(g) ?? []
    arr.push({ ...l, quantity: q, unit_price: 0, discount: 0, tax_rate: 0, tax_rate_id: null, tax_name: null, kit_group: g, is_kit_parent: false, kit_qty_per: per })
    sent.set(g, arr)
  }

  // 3. assemble in order: each kit line followed by its items
  const out: Line[] = []
  for (const l of incoming) {
    if (!isKit(l)) { if (!l.kit_group) out.push(l); continue }
    const g = groupOf.get(l)!
    const isNew = !l.id
    const parent: Line = { ...l, kit_group: g, is_kit_parent: true, kit_qty_per: null }
    if (isNew) parent.kit_unit_cost = kitUnitCost(catalog[l.product_id as string].components)
    out.push(parent)
    const pq = num(l.quantity)
    let kids = sent.get(g)
    if (!kids) {
      const saved = typeof l.kit_group === 'string' ? existing[l.kit_group] : undefined
      kids = saved && saved.length
        ? saved.map(k => ({ ...k, kit_group: g, is_kit_parent: false, quantity: num(k.kit_qty_per) > 0 ? childQty(num(k.kit_qty_per), pq) : num(k.quantity) }))
        : buildChildren(l.product_id as string, g, pq, catalog)
    }
    out.push(...kids)
  }
  return { ok: true, lines: out }
}
