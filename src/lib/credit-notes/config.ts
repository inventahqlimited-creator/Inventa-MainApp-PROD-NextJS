// src/lib/credit-notes/config.ts
// Settings → Sales → Credit Notes. Stored per organisation in organisations.credit_note_settings (jsonb):
// on/off, the number format (prefix, suffix, start, digits), whether Xero receives credit notes as Draft or Authorised,
// and the printed template (same layout options as the invoice).
import { normalizeInvoiceConfig, type InvoiceConfig } from '@/lib/invoice/config'

export type CreditNoteSettings = {
  enabled: boolean
  prefix: string
  suffix: string
  start: number
  digits: number
  xero_status: 'DRAFT' | 'AUTHORISED'
  template: InvoiceConfig
}

export const DEFAULT_CREDIT_NOTE_SETTINGS: CreditNoteSettings = {
  enabled: true, prefix: 'CN-', suffix: '', start: 1, digits: 4, xero_status: 'AUTHORISED',
  template: normalizeInvoiceConfig(null),
}

const int = (v: unknown, d: number, min: number, max: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}

export function normalizeCreditNoteSettings(raw: unknown): CreditNoteSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_CREDIT_NOTE_SETTINGS
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
    prefix: typeof s.prefix === 'string' ? s.prefix.trim().slice(0, 12) : d.prefix,
    suffix: typeof s.suffix === 'string' ? s.suffix.trim().slice(0, 12) : d.suffix,
    start: int(s.start, d.start, 1, 999999999),
    digits: int(s.digits, d.digits, 1, 10),
    xero_status: s.xero_status === 'DRAFT' ? 'DRAFT' : 'AUTHORISED',
    template: normalizeInvoiceConfig(s.template),
  }
}

/** The next credit note number for an organisation, e.g. CN-0001. Looks at what exists, so a gap never repeats a number. */
export function formatCreditNoteNumber(s: CreditNoteSettings, existing: string[]): string {
  let max = s.start - 1
  for (const num of existing) {
    let n = num
    if (s.prefix && n.startsWith(s.prefix)) n = n.slice(s.prefix.length)
    if (s.suffix && n.endsWith(s.suffix)) n = n.slice(0, -s.suffix.length)
    if (/^\d+$/.test(n) && parseInt(n, 10) > max) max = parseInt(n, 10)
  }
  return `${s.prefix}${String(max + 1).padStart(s.digits, '0')}${s.suffix}`
}

export type CnLineInput = {
  so_line_id: string
  quantity: number
  bin_id?: string | null
  serial_number?: string | null
  batch_number?: string | null
  expiry_date?: string | null
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

/** Line total including tax: qty × price, less discount, plus tax. */
export const creditLineTotal = (l: { quantity: unknown; unit_price: unknown; discount: unknown; tax_rate: unknown }) =>
  r2(n(l.quantity) * n(l.unit_price) * (1 - n(l.discount) / 100) * (1 + n(l.tax_rate) / 100))
