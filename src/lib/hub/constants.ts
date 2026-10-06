export const PLANS = [
  { value: 'monthly', label: 'Monthly', months: 1 },
  { value: 'annual',  label: 'Annual',  months: 12 },
  { value: '2_year',  label: '2 year',  months: 24 },
  { value: '3_year',  label: '3 year',  months: 36 },
] as const
export type PlanValue = typeof PLANS[number]['value']
export const planLabel = (v: string | null | undefined) => PLANS.find(p => p.value === v)?.label ?? '—'
export const isPlan = (v: unknown): v is PlanValue => PLANS.some(p => p.value === v)

export const COUNTRIES = [
  'New Zealand', 'Australia', 'United Kingdom', 'United States', 'Canada', 'Ireland', 'Singapore', 'Hong Kong',
  'India', 'South Africa', 'Fiji', 'Samoa', 'Tonga', 'Papua New Guinea', 'United Arab Emirates', 'Malaysia',
  'Philippines', 'Japan', 'China', 'Germany', 'France', 'Netherlands', 'Other',
]

export const fmtAud = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n) || 0)

const NZ = 'Pacific/Auckland'
export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: v.length === 10 ? 'UTC' : NZ }) : '—'
export const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: NZ }) : '—'

/** yyyy-mm-dd plus N months (clamped to the end of shorter months). */
export function addMonths(start: string, months: number): string {
  const [y, m, d] = start.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last))
  return t.toISOString().slice(0, 10)
}
