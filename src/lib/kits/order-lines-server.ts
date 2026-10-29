// src/lib/kits/order-lines-server.ts — database side of kit order lines (used by the sales order API)
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { ADDON_OFF_MESSAGE, hasAddon } from '@/lib/addons-server'
import { loadKitSettings } from './settings-server'
import { componentCost, resolveKitLines, type KitCatalog, type KitScreenData, type OrderKind } from './order-lines'

type Line = Record<string, unknown>
type Prod = { id: string; name: string; sku: string | null; sell_uom: string | null; buy_uom: string | null; unit: string | null; avg_cost: number | null; last_cost: number | null; cost_price: number | null; buy_tax_rate_id: string | null; tax_rate: number | string | null }

// where each kind of order keeps its lines
export const TABLE: Record<OrderKind, { lines: string; fk: string }> = {
  sales: { lines: 'sales_order_lines', fk: 'so_id' },
  purchase: { lines: 'purchase_order_lines', fk: 'po_id' },
  transfer: { lines: 'transfer_order_lines', fk: 'tr_id' },
}

/** Bill of Materials of the given kits, with item details and costs. Empty if the kit columns/tables aren't there yet. */
export async function loadCatalogFor(db: SupabaseClient, orgId: string, kitIds: string[]): Promise<KitCatalog> {
  const catalog: KitCatalog = {}
  if (!kitIds.length) return catalog
  const { data: bom } = await db.from('product_bom_lines').select('kit_id, component_id, quantity, sort_order').eq('org_id', orgId).in('kit_id', kitIds).order('sort_order')
  const rows = (bom ?? []) as { kit_id: string; component_id: string; quantity: number }[]
  const compIds = [...new Set(rows.map(r => r.component_id))]
  const prods = new Map<string, Prod>()
  if (compIds.length) {
    const { data } = await db.from('products').select('id, name, sku, sell_uom, buy_uom, unit, avg_cost, last_cost, cost_price, buy_tax_rate_id, tax_rate').eq('org_id', orgId).in('id', compIds)
    for (const p of (data ?? []) as Prod[]) prods.set(p.id, p)
  }
  const { data: taxData } = await db.from('tax_rates').select('id, name, rate').eq('org_id', orgId)
  const taxes = new Map(((taxData ?? []) as { id: string; name: string; rate: number | string }[]).map(t => [t.id, t]))
  for (const id of kitIds) catalog[id] = { components: [] }
  for (const r of rows) {
    const p = prods.get(r.component_id)
    if (!p) continue
    const t = p.buy_tax_rate_id ? taxes.get(p.buy_tax_rate_id) : undefined
    catalog[r.kit_id].components.push({
      product_id: p.id, name: p.name, sku: p.sku, unit: p.sell_uom ?? p.unit, quantity: Number(r.quantity), cost: componentCost(p),
      tax: t ? { id: t.id, name: t.name, rate: Number(t.rate) || 0 } : { id: null, name: Number(p.tax_rate) ? `${Number(p.tax_rate)}%` : 'No Tax', rate: Number(p.tax_rate) || 0 },
    })
  }
  return catalog
}

/** Which of these products are kits (none if the column doesn't exist yet) */
export async function kitIdsAmong(db: SupabaseClient, orgId: string, productIds: string[]): Promise<string[]> {
  if (!productIds.length) return []
  const { data, error } = await db.from('products').select('id').eq('org_id', orgId).eq('is_kit', true).in('id', productIds)
  if (error) return []
  return ((data ?? []) as { id: string }[]).map(r => r.id)
}

/**
 * Prepares the lines of an order for saving. Orders without kits pass through untouched.
 * `orderId` is given when editing, so items already saved on the order are kept when the screen sent the kit only.
 */
export async function prepareKitLines(db: SupabaseClient, orgId: string, kind: OrderKind, lines: Line[], orderId?: string): Promise<{ ok: true; lines: Line[] } | { ok: false; error: string; status: number }> {
  const ids = [...new Set(lines.map(l => l.product_id).filter((x): x is string => typeof x === 'string'))]
  const kitIds = await kitIdsAmong(db, orgId, ids)
  if (!kitIds.length) return { ok: true, lines }
  if (!(await hasAddon(db, orgId, 'kits'))) {
    // add-on switched off: orders already on the books stay as they are, but no new kit lines
    if (lines.some(l => !l.id && typeof l.product_id === 'string' && kitIds.includes(l.product_id))) return { ok: false, error: ADDON_OFF_MESSAGE, status: 403 }
    return { ok: true, lines }
  }
  const catalog = await loadCatalogFor(db, orgId, kitIds)
  const existingChildren: Record<string, Line[]> = {}
  if (orderId) {
    const t = TABLE[kind]
    const { data } = await db.from(t.lines).select('*').eq(t.fk, orderId).eq('org_id', orgId).eq('is_kit_parent', false).not('kit_group', 'is', null)
    for (const r of (data ?? []) as Line[]) { const g = String(r.kit_group); (existingChildren[g] ??= []).push(r) }
  }
  const res = resolveKitLines({ incoming: lines, catalog, existingChildren, newGroup: () => randomUUID(), kind })
  return res.ok ? res : { ok: false, error: res.error, status: 400 }
}
export const prepareSalesKitLines = (db: SupabaseClient, orgId: string, lines: Line[], soId?: string) => prepareKitLines(db, orgId, 'sales', lines, soId)

export async function loadKitScreenData(db: SupabaseClient, orgId: string): Promise<KitScreenData> {
  const enabled = await hasAddon(db, orgId, 'kits')
  const settings = await loadKitSettings(db, orgId)
  if (!enabled) return { enabled, settings, catalog: {} }
  const { data } = await db.from('products').select('id').eq('org_id', orgId).eq('is_kit', true)
  const kitIds = ((data ?? []) as { id: string }[]).map(r => r.id)
  return { enabled, settings, catalog: await loadCatalogFor(db, orgId, kitIds) }
}

export type KitCols = { kit_group: string | null; is_kit_parent: boolean; kit_qty_per: number | null; kit_qty: number | null }

/** Kit columns of an order's saved lines (read separately so orders still load before the kit SQL has been run) */
export async function loadKitColumns(db: SupabaseClient, orgId: string, orderId: string, kind: OrderKind = 'sales'): Promise<Map<string, KitCols>> {
  const out = new Map<string, KitCols>()
  const t = TABLE[kind]
  const cols = kind === 'sales' ? 'id, kit_group, is_kit_parent, kit_qty_per' : 'id, kit_group, is_kit_parent, kit_qty_per, kit_qty'
  const { data, error } = await db.from(t.lines).select(cols).eq(t.fk, orderId).eq('org_id', orgId)
  if (error) return out
  for (const r of (data ?? []) as unknown as { id: string; kit_group: string | null; is_kit_parent: boolean | null; kit_qty_per: number | null; kit_qty?: number | null }[]) {
    if (r.kit_group) out.set(r.id, { kit_group: r.kit_group, is_kit_parent: !!r.is_kit_parent, kit_qty_per: r.kit_qty_per == null ? null : Number(r.kit_qty_per), kit_qty: r.kit_qty == null ? null : Number(r.kit_qty) })
  }
  return out
}
