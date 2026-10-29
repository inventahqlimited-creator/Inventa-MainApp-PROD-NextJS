import { describe, it, expect } from 'vitest'
import { buildChildren, childQty, kitUnitCost, resolveKitLines, type KitCatalog } from './order-lines'

const KIT = 'k1'
const A = 'a1', B = 'b1'
const catalog: KitCatalog = { [KIT]: { components: [
  { product_id: A, name: 'Can', sku: 'CAN', unit: 'Each', quantity: 2, cost: 1.5 },
  { product_id: B, name: 'Lid', sku: 'LID', unit: 'Each', quantity: 1, cost: 0.5 },
] } }
const G = '11111111-1111-4111-8111-111111111111'
const kitLine = (extra = {}) => ({ product_id: KIT, product_name: 'Six pack', quantity: 10, unit_price: 20, discount: 0, tax_rate: 15, ...extra })
let n = 0
const newGroup = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('kit order lines', () => {
  it('multiplies item quantities by the kit quantity', () => {
    expect(childQty(2, 10)).toBe(20)
    const kids = buildChildren(KIT, G, 10, catalog)
    expect(kids.map(k => k.quantity)).toEqual([20, 10])
    expect(kids.every(k => k.unit_price === 0 && k.tax_rate === 0 && k.is_kit_parent === false)).toBe(true)
  })
  it('costs one kit from its items', () => {
    expect(kitUnitCost(catalog[KIT].components)).toBe(3.5)
  })
  it('leaves orders without kits alone', () => {
    const lines = [{ product_id: 'x', quantity: 1 }]
    expect(resolveKitLines({ incoming: lines, catalog, newGroup })).toEqual({ ok: true, lines })
  })
  it('expands a kit sent on its own, snapshotting its cost on a new line', () => {
    const r = resolveKitLines({ incoming: [kitLine()], catalog, newGroup })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lines).toHaveLength(3)
    expect(r.lines[0]).toMatchObject({ is_kit_parent: true, unit_price: 20, kit_unit_cost: 3.5 })
    expect(r.lines[1]).toMatchObject({ product_id: A, quantity: 20, unit_price: 0 })
    expect(r.lines[1].kit_group).toBe(r.lines[0].kit_group)
  })
  it('does not re-snapshot the cost of a kit line already saved', () => {
    const r = resolveKitLines({ incoming: [kitLine({ id: 'L1', kit_group: G })], catalog, newGroup })
    expect(r.ok && r.lines[0].kit_unit_cost).toBeUndefined()
  })
  it('keeps a quantity changed on one item, and zeroes its price', () => {
    const r = resolveKitLines({ incoming: [
      kitLine({ kit_group: G }),
      { product_id: A, product_name: 'Can', quantity: 25, unit_price: 9, kit_group: G },
      { product_id: B, product_name: 'Lid', quantity: 10, kit_group: G },
    ], catalog, newGroup })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lines[1]).toMatchObject({ quantity: 25, unit_price: 0, kit_qty_per: 2.5 })
  })
  it('keeps saved items when the screen shows the kit only, recalculating for a new kit quantity', () => {
    const saved = { id: 'C1', product_id: A, product_name: 'Can', quantity: 20, kit_qty_per: 2, kit_group: G, is_kit_parent: false, unit_price: 0 }
    const r = resolveKitLines({ incoming: [kitLine({ id: 'L1', kit_group: G, quantity: 5 })], catalog, existingChildren: { [G]: [saved] }, newGroup })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lines[1]).toMatchObject({ id: 'C1', quantity: 10 })
  })
  it('rejects an item that is not in the kit, a zero quantity and a lost kit', () => {
    const bad = resolveKitLines({ incoming: [kitLine({ kit_group: G }), { product_id: 'zzz', product_name: 'Other', quantity: 1, kit_group: G }], catalog, newGroup })
    expect(bad.ok).toBe(false)
    const zero = resolveKitLines({ incoming: [kitLine({ kit_group: G }), { product_id: A, product_name: 'Can', quantity: 0, kit_group: G }], catalog, newGroup })
    expect(zero.ok).toBe(false)
    const orphan = resolveKitLines({ incoming: [{ product_id: A, product_name: 'Can', quantity: 1, kit_group: G }], catalog, newGroup })
    expect(orphan.ok).toBe(false)
  })
})
