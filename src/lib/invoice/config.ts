// src/lib/invoice/config.ts
// What the invoice shows, plus the few things an invoice needs that aren't stored anywhere else (number prefix, bank
// details, default notes). Stored per organisation (organisations.invoice_settings, jsonb) and edited in
// Settings → Sales → Sales Documents → Invoice. Description, Qty and Amount are always printed.

export type InvoiceConfig = {
  header: { logo: boolean; businessDetails: boolean }
  details: { invoiceDate: boolean; dueDate: boolean; terms: boolean; orderNumber: boolean; customerPo: boolean }
  addresses: { billTo: boolean; shipTo: boolean }
  columns: { sku: boolean; unitPrice: boolean; discount: boolean; tax: boolean }
  footer: { paymentDetails: boolean; notes: boolean }
  content: { numberPrefix: string; bankName: string; accountName: string; accountNumber: string; notes: string }
}

export const DEFAULT_INVOICE_CONFIG: InvoiceConfig = {
  header: { logo: true, businessDetails: true },
  details: { invoiceDate: true, dueDate: true, terms: true, orderNumber: true, customerPo: true },
  addresses: { billTo: true, shipTo: true },
  columns: { sku: true, unitPrice: true, discount: true, tax: true },
  footer: { paymentDetails: true, notes: true },
  content: { numberPrefix: 'INV-', bankName: '', accountName: '', accountNumber: '', notes: '' },
}

type Toggles = Exclude<keyof InvoiceConfig, 'content'>

// Anything missing or malformed falls back to "show it", so a half-saved setting can never hide something by accident.
export function normalizeInvoiceConfig(raw: unknown): InvoiceConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>
  const pick = <K extends Toggles>(group: K): InvoiceConfig[K] => {
    const def = DEFAULT_INVOICE_CONFIG[group] as Record<string, boolean>
    const got = (src[group] ?? {}) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const k of Object.keys(def)) out[k] = typeof got[k] === 'boolean' ? (got[k] as boolean) : def[k]
    return out as InvoiceConfig[K]
  }
  const c = (src.content ?? {}) as Record<string, unknown>
  const text = (k: keyof InvoiceConfig['content'], max: number) =>
    typeof c[k] === 'string' ? (c[k] as string).trim().slice(0, max) : DEFAULT_INVOICE_CONFIG.content[k]
  return {
    header: pick('header'), details: pick('details'), addresses: pick('addresses'), columns: pick('columns'), footer: pick('footer'),
    content: {
      // an empty prefix is allowed (numbers then match the order number), so only fall back when it was never saved
      numberPrefix: typeof c.numberPrefix === 'string' ? (c.numberPrefix as string).trim().slice(0, 12) : DEFAULT_INVOICE_CONFIG.content.numberPrefix,
      bankName: text('bankName', 80), accountName: text('accountName', 120), accountNumber: text('accountNumber', 60), notes: text('notes', 600),
    },
  }
}

// Wording used by the Settings screen
export const INVOICE_OPTIONS: { group: Toggles; title: string; items: { key: string; label: string; always?: boolean }[] }[] = [
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
      { key: 'billTo', label: 'Bill to' },
      { key: 'shipTo', label: 'Ship to' },
    ],
  },
  {
    group: 'details',
    title: 'Invoice details',
    items: [
      { key: 'invoiceDate', label: 'Invoice date' },
      { key: 'dueDate', label: 'Due date' },
      { key: 'terms', label: 'Terms' },
      { key: 'orderNumber', label: 'Order #' },
      { key: 'customerPo', label: 'Customer PO' },
    ],
  },
  {
    group: 'columns',
    title: 'Table columns',
    items: [
      { key: 'description', label: 'Description', always: true },
      { key: 'sku', label: 'SKU' },
      { key: 'qty', label: 'Qty', always: true },
      { key: 'unitPrice', label: 'Unit price' },
      { key: 'discount', label: 'Discount' },
      { key: 'tax', label: 'Tax' },
      { key: 'amount', label: 'Amount', always: true },
    ],
  },
  {
    group: 'footer',
    title: 'Bottom of the page',
    items: [
      { key: 'paymentDetails', label: 'Payment details' },
      { key: 'notes', label: 'Notes' },
    ],
  },
]

// Typed-in content (Settings screen)
export const INVOICE_TEXT_FIELDS: { key: keyof InvoiceConfig['content']; label: string; hint?: string; multiline?: boolean; placeholder?: string }[] = [
  { key: 'numberPrefix', label: 'Invoice number prefix', hint: 'INV- gives INV-0005 for order SO-0005', placeholder: 'INV-' },
  { key: 'bankName', label: 'Bank', placeholder: 'e.g. ANZ' },
  { key: 'accountName', label: 'Account name', placeholder: 'e.g. Your Business Ltd' },
  { key: 'accountNumber', label: 'Account number', placeholder: 'e.g. 01-0000-0000000-00' },
  { key: 'notes', label: 'Notes on every invoice', hint: 'Printed after any note on the order', multiline: true, placeholder: 'e.g. Thank you for your business.' },
]
