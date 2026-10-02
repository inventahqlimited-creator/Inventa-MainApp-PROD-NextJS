// src/lib/purchase-order/config.ts
// What a printed purchase order shows. Stored per organisation (organisations.purchase_order_settings, jsonb) and edited in
// Settings → Purchases → Purchase Documents → Purchase Order. Description, Qty and Amount are always printed.
// A purchase order uses the same page layout as the invoice (lib/invoice/render.ts), so this config is turned into an
// InvoiceConfig before it is rendered.

import type { InvoiceConfig } from '@/lib/invoice/config'

export type PurchaseOrderConfig = {
  header: { logo: boolean; businessDetails: boolean }
  details: { orderDate: boolean; expectedDelivery: boolean; terms: boolean; supplierRef: boolean }
  addresses: { supplier: boolean; deliverTo: boolean }
  columns: { sku: boolean; unitCost: boolean; discount: boolean; tax: boolean }
  footer: { notes: boolean }
  content: { notes: string }
}

export const DEFAULT_PURCHASE_ORDER_CONFIG: PurchaseOrderConfig = {
  header: { logo: true, businessDetails: true },
  details: { orderDate: true, expectedDelivery: true, terms: true, supplierRef: true },
  addresses: { supplier: true, deliverTo: true },
  columns: { sku: true, unitCost: true, discount: true, tax: true },
  footer: { notes: true },
  content: { notes: '' },
}

type Toggles = Exclude<keyof PurchaseOrderConfig, 'content'>

// Anything missing or malformed falls back to "show it", so a half-saved setting can never hide something by accident.
export function normalizePurchaseOrderConfig(raw: unknown): PurchaseOrderConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>
  const pick = <K extends Toggles>(group: K): PurchaseOrderConfig[K] => {
    const def = DEFAULT_PURCHASE_ORDER_CONFIG[group] as Record<string, boolean>
    const got = (src[group] ?? {}) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const k of Object.keys(def)) out[k] = typeof got[k] === 'boolean' ? (got[k] as boolean) : def[k]
    return out as PurchaseOrderConfig[K]
  }
  const c = (src.content ?? {}) as Record<string, unknown>
  return {
    header: pick('header'), details: pick('details'), addresses: pick('addresses'), columns: pick('columns'), footer: pick('footer'),
    content: { notes: typeof c.notes === 'string' ? c.notes.trim().slice(0, 600) : '' },
  }
}

/** The invoice layout's own settings, filled from the purchase order settings. */
export function toInvoiceConfig(cfg: PurchaseOrderConfig): InvoiceConfig {
  return {
    header: { ...cfg.header },
    details: { invoiceDate: cfg.details.orderDate, dueDate: cfg.details.expectedDelivery, terms: cfg.details.terms, orderNumber: false, customerPo: cfg.details.supplierRef },
    addresses: { billTo: cfg.addresses.supplier, shipTo: cfg.addresses.deliverTo },
    columns: { sku: cfg.columns.sku, unitPrice: cfg.columns.unitCost, discount: cfg.columns.discount, tax: cfg.columns.tax },
    footer: { paymentDetails: false, notes: cfg.footer.notes },
    content: { numberPrefix: '', bankName: '', accountName: '', accountNumber: '', notes: cfg.content.notes },
  }
}

// Wording used by the Settings screen
export const PURCHASE_ORDER_OPTIONS: { group: Toggles; title: string; items: { key: string; label: string; always?: boolean }[] }[] = [
  {
    group: 'header',
    title: 'Top of the page',
    items: [
      { key: 'logo', label: 'Business logo' },
      { key: 'businessDetails', label: 'Business name, address, contact and tax numbers' },
    ],
  },
  {
    group: 'addresses',
    title: 'Addresses',
    items: [
      { key: 'supplier', label: 'Supplier' },
      { key: 'deliverTo', label: 'Deliver to' },
    ],
  },
  {
    group: 'details',
    title: 'Order details',
    items: [
      { key: 'orderDate', label: 'Order date' },
      { key: 'expectedDelivery', label: 'Expected delivery' },
      { key: 'terms', label: 'Terms' },
      { key: 'supplierRef', label: 'Supplier reference' },
    ],
  },
  {
    group: 'columns',
    title: 'Table columns',
    items: [
      { key: 'description', label: 'Description', always: true },
      { key: 'sku', label: 'SKU' },
      { key: 'qty', label: 'Qty', always: true },
      { key: 'unitCost', label: 'Unit cost' },
      { key: 'discount', label: 'Discount' },
      { key: 'tax', label: 'Tax' },
      { key: 'amount', label: 'Amount', always: true },
    ],
  },
  {
    group: 'footer',
    title: 'Bottom of the page',
    items: [{ key: 'notes', label: 'Notes' }],
  },
]

export const PURCHASE_ORDER_TEXT_FIELDS: { key: keyof PurchaseOrderConfig['content']; label: string; hint?: string; multiline?: boolean; placeholder?: string }[] = [
  { key: 'notes', label: 'Notes on every purchase order', hint: 'Printed after any note on the order', multiline: true, placeholder: 'e.g. Please quote the PO number on your invoice and delivery documents.' },
]
