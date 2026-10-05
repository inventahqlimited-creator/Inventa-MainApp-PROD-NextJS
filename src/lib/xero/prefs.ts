// src/lib/xero/prefs.ts
// The Xero posting and schedule choices an admin makes in Settings → Integrations → Xero.
// Stored in xero_connections.preferences (separate from the Accounts and tax settings so one cannot wipe the other).

export type PostStatus = 'DRAFT' | 'AUTHORISED'
export type JournalStatus = 'DRAFT' | 'POSTED'
export type DateBasis = 'created' | 'delivery'
export type Schedule = 'manual' | '1h' | '4h' | '24h' | '7d'
export type Scope = 'full' | 'invoices' | 'invoices_bills' | 'contacts_products' | 'adjustments'

export type XeroPrefs = {
  invoice_status: PostStatus
  bill_status: PostStatus
  date_basis: DateBasis
  schedule: Schedule
  scope: Scope
  /** Does Xero hold the stock quantities? No (default): InventaHQ sends a journal for each stock adjustment. Yes: adjustments are posted in Xero by hand. */
  inventory_tracked: boolean
  /** Status of the journals posted for stock adjustments (Draft lets the accountant review first). */
  journal_status: JournalStatus
  /** Only adjustments completed on or after this moment are posted. Set by the server, never by the browser. */
  adjust_from: string | null
}

export const DEFAULT_PREFS: XeroPrefs = {
  invoice_status: 'DRAFT',
  bill_status: 'DRAFT',
  date_basis: 'delivery',
  schedule: 'manual',
  scope: 'full',
  inventory_tracked: false,
  journal_status: 'DRAFT',
  adjust_from: null,
}

export const SCHEDULE_LABELS: Record<Schedule, string> = {
  manual: 'Manual only', '1h': 'Every hour', '4h': 'Every 4 hours', '24h': 'Every 24 hours', '7d': 'Every week',
}
export const SCOPE_LABELS: Record<Scope, string> = {
  full: 'Full sync (contacts, products, invoices, bills and stock adjustments)',
  invoices: 'Only invoices',
  invoices_bills: 'Only invoices and bills',
  contacts_products: 'Only contacts and products',
  adjustments: 'Only stock adjustments',
}

/** What a failed invoice says when Xero has too little stock of a tracked item. The dashboard shows a short label and this text on hover. */
export const STOCK_ERROR_PREFIX = 'Xero doesn’t have enough stock of'
export const stockError = (item: string | null) =>
  `${STOCK_ERROR_PREFIX} ${item || 'an item on this order'}. Post the purchase bill or adjust stock in Xero, then post again.`

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

export function normalizePrefs(raw: unknown): XeroPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    invoice_status: pick(r.invoice_status, ['DRAFT', 'AUTHORISED'], DEFAULT_PREFS.invoice_status),
    bill_status: pick(r.bill_status, ['DRAFT', 'AUTHORISED'], DEFAULT_PREFS.bill_status),
    date_basis: pick(r.date_basis, ['created', 'delivery'], DEFAULT_PREFS.date_basis),
    schedule: pick(r.schedule, ['manual', '1h', '4h', '24h', '7d'], DEFAULT_PREFS.schedule),
    scope: pick(r.scope, ['full', 'invoices', 'invoices_bills', 'contacts_products', 'adjustments'], DEFAULT_PREFS.scope),
    inventory_tracked: r.inventory_tracked === true,
    journal_status: pick(r.journal_status, ['DRAFT', 'POSTED'], DEFAULT_PREFS.journal_status),
    adjust_from: typeof r.adjust_from === 'string' && Number.isFinite(Date.parse(r.adjust_from)) ? r.adjust_from : null,
  }
}

const HOUR = 3600_000
export const intervalMs = (s: Schedule): number | null =>
  s === '1h' ? HOUR : s === '4h' ? 4 * HOUR : s === '24h' ? 24 * HOUR : s === '7d' ? 7 * 24 * HOUR : null

/** When the next automatic sync is due, counting from `from`. Null for manual. */
export const nextSyncFrom = (s: Schedule, from: Date = new Date()): string | null => {
  const ms = intervalMs(s)
  return ms === null ? null : new Date(from.getTime() + ms).toISOString()
}

export const scopeIncludes = (scope: Scope) => ({
  contacts: scope === 'full' || scope === 'contacts_products',
  products: scope === 'full' || scope === 'contacts_products',
  invoices: scope === 'full' || scope === 'invoices' || scope === 'invoices_bills',
  bills: scope === 'full' || scope === 'invoices_bills',
  adjustments: scope === 'full' || scope === 'adjustments',
})
