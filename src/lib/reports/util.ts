// src/lib/reports/util.ts
// Shared helpers for the report queries (server side).
import type { Filters } from './registry'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

export const MAX_ROWS = 20000
const PAGE = 1000

/** Reads every page of a query (Supabase returns at most 1000 rows per request). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'Query failed')
    const got = data ?? []
    rows.push(...got)
    if (got.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/** Runs a query for a long list of ids in chunks (keeps the URL short) and reads every page of each chunk. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function inChunks<T = any>(ids: string[], run: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>, size = 60): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size)
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await run(chunk, from, from + PAGE - 1)
      if (error) throw new Error(typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'Query failed')
      const got = data ?? []
      out.push(...got)
      if (got.length < PAGE) break
    }
  }
  return out
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000
export const n0 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export const fStr = (f: Filters, k: string): string => { const v = f[k]; return typeof v === 'string' ? v.trim() : '' }
export const fNum = (f: Filters, k: string): number | null => { const v = f[k]; if (v === '' || v === undefined || v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null }
export const fBool = (f: Filters, k: string): boolean => f[k] === true || f[k] === 'true'
export const fArr = (f: Filters, k: string): string[] => { const v = f[k]; return Array.isArray(v) ? v.map(String) : [] }

export const ymd = (v: unknown): string => (v ? String(v).slice(0, 10) : '')

export function inRange(date: string, from: string, to: string): boolean {
  if (!from && !to) return true
  if (!date) return false
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()
}

/** The first instant AFTER the given calendar day in the org's timezone, as an ISO string (UTC). */
export function endOfDayUtc(day: string, tz: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d + 1, 0, 0, 0)
  let off = 0
  try { off = tzOffsetMs(tz, new Date(guess)) } catch { off = 0 }
  return new Date(guess - off).toISOString()
}

/** Today's calendar date in the org's timezone (YYYY-MM-DD). */
export function todayIn(tz: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) } catch { return new Date().toISOString().slice(0, 10) }
}

/** Calendar day of a timestamp in the org's timezone. */
export function dayIn(ts: string, tz: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)) } catch { return ymd(ts) }
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export interface ProductLite {
  id: string; name: string; sku: string | null; unit: string | null; type: string | null; track_stock: boolean | null
  cost_price: number | null; avg_cost: number | null; last_cost: number | null; sell_price: number | null
  tags: string[] | null; default_supplier_id: string | null; low_stock_threshold: number | null; min_order_qty: number | null; lead_time_days: number | null
  is_active: boolean | null
}

export const PRODUCT_LITE_COLS = 'id, name, sku, unit, type, track_stock, cost_price, avg_cost, last_cost, sell_price, tags, default_supplier_id, low_stock_threshold, min_order_qty, lead_time_days, is_active'

export async function loadProducts(db: Db, orgId: string): Promise<{ list: ProductLite[]; map: Map<string, ProductLite> }> {
  const { rows } = await fetchAll<ProductLite>((a, b) => db.from('products').select(PRODUCT_LITE_COLS).eq('org_id', orgId).order('name').range(a, b))
  return { list: rows, map: new Map(rows.map(p => [p.id, p])) }
}

export type CostBasis = 'avg' | 'last' | 'std'
export const BASIS_LABEL: Record<CostBasis, string> = { avg: 'average cost', last: 'last purchase cost', std: 'product cost price' }

export function costOf(p: ProductLite | undefined, basis: CostBasis): number {
  if (!p) return 0
  const avg = n0(p.avg_cost), last = n0(p.last_cost), std = n0(p.cost_price)
  if (basis === 'std') return std
  if (basis === 'last') return last > 0 ? last : std
  return avg > 0 ? avg : last > 0 ? last : std
}

export const isStocked = (p: ProductLite | undefined): boolean => !!p && p.track_stock !== false && (p.type ?? 'Stock') === 'Stock'

export const basisOf = (v: string): CostBasis => (v === 'last' || v === 'std' ? v : 'avg')

/** Tag filter on a product. */
export const hasTag = (p: ProductLite | undefined, tag: string): boolean => !tag || !!p?.tags?.some(t => t.toLowerCase() === tag.toLowerCase())

export async function loadOrg(db: Db, orgId: string): Promise<{ tz: string; currency: string }> {
  const { data } = await db.from('organisations').select('timezone, currency, base_currency').eq('id', orgId).single()
  const o = (data ?? {}) as { timezone?: string | null; currency?: string | null; base_currency?: string | null }
  return { tz: o.timezone || 'Pacific/Auckland', currency: o.currency || o.base_currency || 'NZD' }
}

export async function loadLocations(db: Db, orgId: string): Promise<Map<string, string>> {
  const { data } = await db.from('locations').select('id, name').eq('org_id', orgId)
  return new Map(((data ?? []) as { id: string; name: string }[]).map(l => [l.id, l.name]))
}

export async function loadBins(db: Db, orgId: string): Promise<Map<string, { name: string; location_id: string | null }>> {
  const { data } = await db.from('bins').select('id, name, location_id').eq('org_id', orgId)
  return new Map(((data ?? []) as { id: string; name: string; location_id: string | null }[]).map(b => [b.id, { name: b.name, location_id: b.location_id }]))
}

export async function loadContactsMap(db: Db, orgId: string): Promise<Map<string, { id: string; name: string; type: string | null; tier: string | null; country: string | null; balance_owing: number | null }>> {
  const { rows } = await fetchAll<{ id: string; name: string; type: string | null; tier: string | null; country: string | null; bill_country: string | null; balance_owing: number | null }>((a, b) => db.from('contacts').select('id, name, type, tier, country, bill_country, balance_owing').eq('org_id', orgId).range(a, b))
  return new Map(rows.map(c => [c.id, { id: c.id, name: c.name, type: c.type, tier: c.tier, country: c.bill_country || c.country, balance_owing: c.balance_owing }]))
}

/** Custom field values are stored by name (older rows by id). Returns label → value. */
export function customValues(cf: unknown, idToName: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
    for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
      if (v === null || v === undefined || v === '') continue
      out[idToName.get(k) ?? k] = Array.isArray(v) ? v.join(', ') : String(v)
    }
  }
  return out
}

const statusKey = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Status filter shared by the order reports. A picked status list wins; otherwise cancelled, draft and quote are hidden unless asked for. */
export function statusOk(status: unknown, picked: string[], inclAll: boolean): boolean {
  const k = statusKey(status)
  if (picked.length) return picked.some(p => statusKey(p) === k)
  if (inclAll) return true
  return k !== 'cancelled' && k !== 'draft' && k !== 'quote'
}

export const badgeStatus = (s: unknown): string => String(s ?? '') || '—'
