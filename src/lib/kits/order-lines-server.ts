// src/lib/kits/order-lines-server.ts — database side of kit order lines (used by the sales order API)
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { ADDON_OFF_MESSAGE, hasAddon } from '@/lib/addons-server'
import { loadKitSettings } from './settings-server'
import { componentCost, resolveKitLines, type KitCatalog, type KitScreenData } from './order-lines'

type Line = Record<string, unknown>
type Prod = { id: string; name: string; sku: string | null; sell_uom: string | null; unit: string | null; avg_cost: number | null; last_cost: number | null; cost_price: number | null }

/** Bill of Materials of the given kits, with item details and costs. Empty if the kit columns/tables aren't there yet. */
export async function loadCatalogFor(db: SupabaseClient, orgId: string, kitIds: string[]): Promise<KitCatalog> {
  const catalog: KitCatalog = {}
  if (!kitIds.length) return catalog
  const { data: bom } = await db.from('product_bom_lines').select('kit_id, component_id, quantity, sort_order').eq('org_id', orgId).in('kit_id', kitIds).order('sort_order')
  const rows = (bom ?? []) as { kit_id: string; component_id: string; quantity: number }[]
  const compIds = [...new Set(rows.map(r => r.component_id))]
  const prods = new Map<string, Prod>()
  if (compIds.length) {
    const { data } = await db.from('products').select('id, name, sku, sell_uom, unit, avg_cost, last_cost, cost_price').eq('org_id', orgId).in('id', compIds)
    for (const p of (data ?? []) as Prod[]) prods.set(p.id, p)
  }
  for (const id of kitIds) catalog[id] = { components: [] }
  for (const r of rows) {
    const p = prods.get(r.component_id)
    if (!p) continue
    catalog[r.kit_id].components.push({ product_id: p.id, name: p.name, sku: p.sku, unit: p.sell_uom ?? p.unit, quantity: Number(r.quantity), cost: componentCost(p) })
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
 * Prepares the lines of a sales order for saving. Orders without kits pass through untouched.
 * `soId` is given when editing, so items already saved on the order are kept when the screen sent the kit only.
 */
export async function prepareSalesKitLines(db: SupabaseClient, orgId: string, lines: Line[], soId?: string): Promise<{ ok: true; lines: Line[] } | { ok: false; error: string; status: number }> {
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
  if (soId) {
    const { data } = await db.from('sales_order_lines').select('*').eq('so_id', soId).eq('org_id', orgId).eq('is_kit_parent', false).not('kit_group', 'is', null)
    for (const r of (data ?? []) as Line[]) { const g = String(r.kit_group); (existingChildren[g] ??= []).push(r) }
  }
  const res = resolveKitLines({ incoming: lines, catalog, existingChildren, newGroup: () => randomUUID() })
  return res.ok ? res : { ok: false, error: res.error, status: 400 }
}

export async function loadKitScreenData(db: SupabaseClient, orgId: string): Promise<KitScreenData> {
  const enabled = await hasAddon(db, orgId, 'kits')
  const settings = await loadKitSettings(db, orgId)
  if (!enabled) return { enabled, settings, catalog: {} }
  const { data } = await db.from('products').select('id').eq('org_id', orgId).eq('is_kit', true)
  const kitIds = ((data ?? []) as { id: string }[]).map(r => r.id)
  return { enabled, settings, catalog: await loadCatalogFor(db, orgId, kitIds) }
}

/** Kit columns of an order's saved lines (read separately so orders still load before the kit SQL has been run) */
export async function loadKitColumns(db: SupabaseClient, orgId: string, soId: string): Promise<Map<string, { kit_group: string | null; is_kit_parent: boolean; kit_qty_per: number | null }>> {
  const out = new Map<string, { kit_group: string | null; is_kit_parent: boolean; kit_qty_per: number | null }>()
  const { data, error } = await db.from('sales_order_lines').select('id, kit_group, is_kit_parent, kit_qty_per').eq('so_id', soId).eq('org_id', orgId)
  if (error) return out
  for (const r of (data ?? []) as { id: string; kit_group: string | null; is_kit_parent: boolean | null; kit_qty_per: number | null }[]) {
    if (r.kit_group) out.set(r.id, { kit_group: r.kit_group, is_kit_parent: !!r.is_kit_parent, kit_qty_per: r.kit_qty_per == null ? null : Number(r.kit_qty_per) })
  }
  return out
}
