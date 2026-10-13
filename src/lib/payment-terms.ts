// src/lib/payment-terms.ts
// Payment terms and due dates. A term has a NAME (what is stored on contacts and orders, e.g. "Net 30") and a RULE:
//   days               N days after the invoice date                (Net 30, COD = 0)
//   days_after_month   N days after the end of the invoice month    (30 days after end of month)
//   day_current_month  day N of the invoice month                   (20th of the current month)
//   day_next_month     day N of the month after the invoice month   (20th of the following month)
// Same four types Xero uses, so terms import one-to-one. Safe to import from client and server code.

export type TermType = 'days' | 'days_after_month' | 'day_current_month' | 'day_next_month'
export type PaymentTerm = { name: string; type: TermType; days: number }

export const TERM_TYPES: { value: TermType; label: string; hint: string }[] = [
  { value: 'days', label: 'Days after the invoice date', hint: 'e.g. 30 → due 30 days after the invoice date (0 = due on the invoice date)' },
  { value: 'days_after_month', label: 'Days after the end of the invoice month', hint: 'e.g. 30 → 30 days after the last day of the invoice month' },
  { value: 'day_current_month', label: 'Day of the invoice month', hint: 'e.g. 20 → the 20th of the month the invoice is dated' },
  { value: 'day_next_month', label: 'Day of the following month', hint: 'e.g. 20 → the 20th of the month after the invoice date' },
]

export const DEFAULT_TERMS: PaymentTerm[] = [
  { name: 'Net 7', type: 'days', days: 7 },
  { name: 'Net 14', type: 'days', days: 14 },
  { name: 'Net 30', type: 'days', days: 30 },
  { name: 'Net 60', type: 'days', days: 60 },
  { name: 'COD', type: 'days', days: 0 },
  { name: 'Prepaid', type: 'days', days: 0 },
]

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`

/** The name a term gets when it is created from its rule (used for Xero imports). */
export function termName(type: TermType, days: number): string {
  switch (type) {
    case 'days': return days === 0 ? 'Due on receipt' : `Net ${days}`
    case 'days_after_month': return `${days} days after end of month`
    case 'day_current_month': return `${ord(days)} of the current month`
    case 'day_next_month': return `${ord(days)} of the following month`
  }
}

export function describeTerm(t: PaymentTerm): string {
  switch (t.type) {
    case 'days': return t.days === 0 ? 'Due on the invoice date' : `${t.days} days after the invoice date`
    case 'days_after_month': return `${t.days} days after the end of the invoice month`
    case 'day_current_month': return `${ord(t.days)} of the invoice month`
    case 'day_next_month': return `${ord(t.days)} of the month after the invoice`
  }
}

/** Xero's PaymentTerms { Day, Type } → a term. null when Xero has nothing usable. */
export function termFromXero(x: { Day?: number | null; Type?: string | null } | null | undefined): PaymentTerm | null {
  if (!x || x.Day === undefined || x.Day === null || !x.Type) return null
  const days = Math.floor(Number(x.Day))
  if (!Number.isFinite(days) || days < 0 || days > 999) return null
  const type: TermType | null = ({ DAYSAFTERBILLDATE: 'days', DAYSAFTERBILLMONTH: 'days_after_month', OFCURRENTMONTH: 'day_current_month', OFFOLLOWINGMONTH: 'day_next_month' } as Record<string, TermType>)[String(x.Type).toUpperCase()] ?? null
  if (!type) return null
  if ((type === 'day_current_month' || type === 'day_next_month') && (days < 1 || days > 31)) return null
  return { name: termName(type, days), type, days }
}

/** A term that is not in the table but still reads like one ("Net 14", "COD", "30 days"). */
export function legacyTerm(name: string): PaymentTerm | null {
  const t = name.trim()
  if (!t) return null
  if (/^(cod|prepaid|due on receipt)/i.test(t)) return { name: t, type: 'days', days: 0 }
  const net = /^net\s*(\d+)/i.exec(t) ?? /^(\d+)\s*days?$/i.exec(t)
  return net ? { name: t, type: 'days', days: Number(net[1]) } : null
}

export function findTerm(name: string | null | undefined, list: PaymentTerm[] = []): PaymentTerm | null {
  const n = String(name ?? '').trim().toLowerCase()
  if (!n) return null
  return list.find(t => t.name.trim().toLowerCase() === n) ?? legacyTerm(n === '' ? '' : String(name))
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null }
/** Day `n` of a month, held to the month's last day (31st of April → 30 April). */
const dayOf = (y: number, m: number, n: number) => ymd(new Date(Date.UTC(y, m, Math.min(n, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))))

/** Due date (YYYY-MM-DD) for an invoice dated `invoiceDate`; null when the term is unknown. */
export function dueDateFor(termNameOrRule: string | PaymentTerm | null | undefined, invoiceDate: string, list: PaymentTerm[] = []): string | null {
  const t = typeof termNameOrRule === 'string' || !termNameOrRule ? findTerm(termNameOrRule as string | null, list) : termNameOrRule
  const p = parse(invoiceDate)
  if (!t || !p) return null
  switch (t.type) {
    case 'days': return ymd(new Date(Date.UTC(p.y, p.m, p.d + t.days)))
    case 'days_after_month': return ymd(new Date(Date.UTC(p.y, p.m + 1, t.days)))
    case 'day_current_month': return dayOf(p.y, p.m, t.days)
    case 'day_next_month': return dayOf(p.y, p.m + 1, t.days)
  }
}

/** Validates a term typed in Settings. */
export function validateTerm(input: { name?: unknown; type?: unknown; days?: unknown }): { value: PaymentTerm } | { error: string } {
  const name = String(input.name ?? '').replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'Give the payment term a name.' }
  if (name.length > 60) return { error: 'The name can be 60 characters at most.' }
  const type = TERM_TYPES.find(t => t.value === input.type)?.value
  if (!type) return { error: 'Choose how the due date is worked out.' }
  const days = Number(input.days)
  if (!Number.isInteger(days) || days < 0 || days > 999) return { error: 'Days must be a whole number from 0 to 999.' }
  if ((type === 'day_current_month' || type === 'day_next_month') && (days < 1 || days > 31)) return { error: 'The day of the month must be between 1 and 31.' }
  return { value: { name, type, days } }
}
