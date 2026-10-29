// src/lib/kits/settings.ts
// Settings > Kits & Bundles: how kits behave on orders, what prints on each document, and whether virtual stock is shown.
// Stored on organisations.kit_settings (jsonb). Anything missing or invalid falls back to the defaults below.

/** What a printed document shows for a kit: just the kit, the kit and its items, or just the items. */
export type DocMode = 'parent' | 'both' | 'components'
export const DOC_MODES: { value: DocMode; label: string }[] = [
  { value: 'parent', label: 'Kit only' },
  { value: 'both', label: 'Kit and its items' },
  { value: 'components', label: 'Items only' },
]
export const DOC_KEYS = ['invoice', 'pick_list', 'packing_list', 'purchase_order', 'transfer'] as const
export type DocKey = typeof DOC_KEYS[number]
export const DOC_LABELS: Record<DocKey, string> = {
  invoice: 'Invoice', pick_list: 'Pick list', packing_list: 'Packing list', purchase_order: 'Purchase order', transfer: 'Transfer',
}

export type KitSettings = {
  expand_sales: boolean
  expand_purchase: boolean
  expand_transfer: boolean
  docs: Record<DocKey, DocMode>
  show_virtual_stock: boolean
}

export const DEFAULT_KIT_SETTINGS: KitSettings = {
  expand_sales: true, expand_purchase: true, expand_transfer: true,
  docs: { invoice: 'parent', pick_list: 'components', packing_list: 'components', purchase_order: 'parent', transfer: 'components' },
  show_virtual_stock: false,
}

const isMode = (v: unknown): v is DocMode => v === 'parent' || v === 'both' || v === 'components'

export function normalizeKitSettings(raw: unknown): KitSettings {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const d = (r.docs && typeof r.docs === 'object' ? r.docs : {}) as Record<string, unknown>
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)
  const docs = { ...DEFAULT_KIT_SETTINGS.docs }
  for (const k of DOC_KEYS) if (isMode(d[k])) docs[k] = d[k] as DocMode
  return {
    expand_sales: bool(r.expand_sales, true),
    expand_purchase: bool(r.expand_purchase, true),
    expand_transfer: bool(r.expand_transfer, true),
    docs,
    show_virtual_stock: bool(r.show_virtual_stock, false),
  }
}
