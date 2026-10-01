// src/lib/packing-list/config.ts
// What the packing list shows. Stored per organisation (organisations.packing_list_settings, jsonb) and edited in
// Settings → Sales → Sales Documents → Packing List. Product and Shipped are always printed.

export type PackingListConfig = {
  header: { logo: boolean; businessDetails: boolean; barcode: boolean }
  meta: { orderDate: boolean; shipDate: boolean; customerRef: boolean; shipBy: boolean }
  addresses: { shipFrom: boolean; shipTo: boolean }
  shipping: { carrier: boolean; service: boolean; tracking: boolean; packages: boolean }
  columns: { notes: boolean; batch: boolean; serial: boolean; expiry: boolean; ordered: boolean; backorder: boolean }
  stats: { lines: boolean; units: boolean; backordered: boolean; packages: boolean }
  footer: { deliveryNotes: boolean; packedBy: boolean; receivedBy: boolean }
}

export const DEFAULT_PACKING_LIST_CONFIG: PackingListConfig = {
  header: { logo: true, businessDetails: true, barcode: true },
  meta: { orderDate: true, shipDate: true, customerRef: true, shipBy: true },
  addresses: { shipFrom: true, shipTo: true },
  shipping: { carrier: true, service: true, tracking: true, packages: true },
  columns: { notes: true, batch: true, serial: true, expiry: true, ordered: true, backorder: true },
  stats: { lines: true, units: true, backordered: true, packages: true },
  footer: { deliveryNotes: true, packedBy: true, receivedBy: true },
}

// Anything missing or malformed falls back to "show it", so a half-saved setting can never hide something by accident.
export function normalizePackingListConfig(raw: unknown): PackingListConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>
  const pick = <K extends keyof PackingListConfig>(group: K): PackingListConfig[K] => {
    const def = DEFAULT_PACKING_LIST_CONFIG[group] as Record<string, boolean>
    const got = (src[group] ?? {}) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const k of Object.keys(def)) out[k] = typeof got[k] === 'boolean' ? (got[k] as boolean) : def[k]
    return out as PackingListConfig[K]
  }
  return {
    header: pick('header'), meta: pick('meta'), addresses: pick('addresses'), shipping: pick('shipping'),
    columns: pick('columns'), stats: pick('stats'), footer: pick('footer'),
  }
}

// Wording used by the Settings screen
export const PACKING_LIST_OPTIONS: { group: keyof PackingListConfig; title: string; items: { key: string; label: string; always?: boolean }[] }[] = [
  {
    group: 'header',
    title: 'Top of the page',
    items: [
      { key: 'logo', label: 'Business logo' },
      { key: 'businessDetails', label: 'Business name, address and contact details' },
      { key: 'barcode', label: 'Barcode' },
    ],
  },
  {
    group: 'meta',
    title: 'Order dates',
    items: [
      { key: 'orderDate', label: 'Order date' },
      { key: 'shipDate', label: 'Ship date' },
      { key: 'customerRef', label: 'Customer order #' },
      { key: 'shipBy', label: 'Ship by date' },
    ],
  },
  {
    group: 'addresses',
    title: 'Addresses',
    items: [
      { key: 'shipFrom', label: 'Ship from' },
      { key: 'shipTo', label: 'Ship to' },
    ],
  },
  {
    group: 'shipping',
    title: 'Shipping details',
    items: [
      { key: 'carrier', label: 'Carrier' },
      { key: 'service', label: 'Service' },
      { key: 'tracking', label: 'Tracking number' },
      { key: 'packages', label: 'Packages' },
    ],
  },
  {
    group: 'columns',
    title: 'Table columns',
    items: [
      { key: 'product', label: 'Product (name and SKU)', always: true },
      { key: 'notes', label: 'Line notes' },
      { key: 'batch', label: 'Batch' },
      { key: 'serial', label: 'Serial' },
      { key: 'expiry', label: 'Expiry' },
      { key: 'ordered', label: 'Ordered' },
      { key: 'shipped', label: 'Shipped', always: true },
      { key: 'backorder', label: 'Back-order' },
    ],
  },
  {
    group: 'stats',
    title: 'Totals at the bottom',
    items: [
      { key: 'lines', label: 'Lines' },
      { key: 'units', label: 'Units shipped' },
      { key: 'backordered', label: 'Back-ordered' },
      { key: 'packages', label: 'Packages' },
    ],
  },
  {
    group: 'footer',
    title: 'Bottom of the page',
    items: [
      { key: 'deliveryNotes', label: 'Delivery notes' },
      { key: 'packedBy', label: 'Packed by' },
      { key: 'receivedBy', label: 'Received by' },
    ],
  },
]
