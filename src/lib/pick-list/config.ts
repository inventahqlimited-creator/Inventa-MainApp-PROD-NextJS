// src/lib/pick-list/config.ts
// What the pick list shows. Stored per organisation (organisations.pick_list_settings, jsonb) and edited in
// Settings → Sales → Sales Documents → Pick List. Product and Qty are always printed.

export type PickListConfig = {
  columns: { notes: boolean; bin: boolean; batch: boolean; serial: boolean; expiry: boolean }
  header: { barcode: boolean; customer: boolean; shipBy: boolean }
  stats: { lines: boolean; units: boolean; bins: boolean; serials: boolean }
  footer: { orderNote: boolean; pickedBy: boolean; checkedBy: boolean }
}

export const DEFAULT_PICK_LIST_CONFIG: PickListConfig = {
  columns: { notes: true, bin: true, batch: true, serial: true, expiry: true },
  header: { barcode: true, customer: true, shipBy: true },
  stats: { lines: true, units: true, bins: true, serials: true },
  footer: { orderNote: true, pickedBy: true, checkedBy: true },
}

// Anything missing or malformed falls back to "show it", so a half-saved setting can never hide a column by accident.
export function normalizePickListConfig(raw: unknown): PickListConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>
  const pick = <K extends keyof PickListConfig>(group: K): PickListConfig[K] => {
    const def = DEFAULT_PICK_LIST_CONFIG[group] as Record<string, boolean>
    const got = (src[group] ?? {}) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const k of Object.keys(def)) out[k] = typeof got[k] === 'boolean' ? (got[k] as boolean) : def[k]
    return out as PickListConfig[K]
  }
  return { columns: pick('columns'), header: pick('header'), stats: pick('stats'), footer: pick('footer') }
}

// Wording used by the Settings screen
export const PICK_LIST_OPTIONS: { group: keyof PickListConfig; title: string; items: { key: string; label: string; always?: boolean }[] }[] = [
  {
    group: 'columns',
    title: 'Table columns',
    items: [
      { key: 'product', label: 'Product (name and SKU)', always: true },
      { key: 'notes', label: 'Notes' },
      { key: 'bin', label: 'Bin' },
      { key: 'batch', label: 'Batch' },
      { key: 'serial', label: 'Serial' },
      { key: 'expiry', label: 'Expiry' },
      { key: 'qty', label: 'Qty', always: true },
    ],
  },
  {
    group: 'header',
    title: 'Top of the page',
    items: [
      { key: 'barcode', label: 'Barcode' },
      { key: 'customer', label: 'Customer name' },
      { key: 'shipBy', label: 'Ship by date' },
    ],
  },
  {
    group: 'stats',
    title: 'Totals at the bottom',
    items: [
      { key: 'lines', label: 'Lines' },
      { key: 'units', label: 'Units to pick' },
      { key: 'bins', label: 'Bins to visit' },
      { key: 'serials', label: 'Needs serials' },
    ],
  },
  {
    group: 'footer',
    title: 'Bottom of the page',
    items: [
      { key: 'orderNote', label: 'Order note' },
      { key: 'pickedBy', label: 'Picked by' },
      { key: 'checkedBy', label: 'Checked by' },
    ],
  },
]
