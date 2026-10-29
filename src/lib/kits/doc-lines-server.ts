// src/lib/kits/doc-lines-server.ts — loads the kit information a printed document needs (nothing happens for organisations without kits).
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasAddon } from '@/lib/addons-server'
import { loadKitSettings } from './settings-server'
import { TABLE, type KitCols } from './order-lines-server'
import type { DocKey, DocMode } from './settings'
import type { OrderKind } from './order-lines'

export type KitDoc = {
  mode: DocMode
  /** kit columns of every kit line (parent or item), by line id */
  flags: Map<string, KitCols>
  /** the saved rows themselves, for building kit headings */
  rows: Record<string, unknown>[]
}

/** Null when the organisation has no kits on these orders (the caller then prints exactly as before). Never throws. */
export async function loadKitDoc(db: SupabaseClient, orgId: string, key: DocKey, kind: OrderKind, orderIds: string[]): Promise<KitDoc | null> {
  try {
    if (orderIds.length === 0) return null
    if (!(await hasAddon(db, orgId, 'kits'))) return null
    const t = TABLE[kind]
    const { data, error } = await db.from(t.lines).select('*').in(t.fk, orderIds).eq('org_id', orgId).not('kit_group', 'is', null)
    if (error || !data || data.length === 0) return null
    const settings = await loadKitSettings(db, orgId)
    const flags = new Map<string, KitCols>()
    for (const r of data as Record<string, unknown>[]) {
      flags.set(String(r.id), {
        kit_group: String(r.kit_group), is_kit_parent: r.is_kit_parent === true,
        kit_qty_per: r.kit_qty_per == null ? null : Number(r.kit_qty_per), kit_qty: r.kit_qty == null ? null : Number(r.kit_qty),
      })
    }
    return { mode: settings.docs[key], flags, rows: data as Record<string, unknown>[] }
  } catch {
    return null
  }
}
