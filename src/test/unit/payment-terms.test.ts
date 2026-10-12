import { describe, it, expect } from 'vitest'
import { dueDateFor, termFromXero, termName, validateTerm, legacyTerm, DEFAULT_TERMS } from '@/lib/payment-terms'

describe('payment terms', () => {
  it('days after the invoice date, including month rollover and COD', () => {
    expect(dueDateFor('Net 30', '2026-10-12', DEFAULT_TERMS)).toBe('2026-11-11')
    expect(dueDateFor('COD', '2026-10-12', DEFAULT_TERMS)).toBe('2026-10-12')
    expect(dueDateFor('net 14', '2026-12-25')).toBe('2027-01-08') // legacy text works without the table
    expect(dueDateFor('Whatever', '2026-10-12')).toBeNull()
  })
  it('end of month and day-of-month rules', () => {
    const eom = { name: '30 days after end of month', type: 'days_after_month' as const, days: 30 }
    expect(dueDateFor(eom, '2026-10-12')).toBe('2026-11-30')
    expect(dueDateFor(eom, '2026-01-31')).toBe('2026-03-02')
    const cur = { name: '20th of the current month', type: 'day_current_month' as const, days: 20 }
    expect(dueDateFor(cur, '2026-10-12')).toBe('2026-10-20')
    const next = { name: '31st of the following month', type: 'day_next_month' as const, days: 31 }
    expect(dueDateFor(next, '2026-03-05')).toBe('2026-04-30') // held to the month's last day
    expect(dueDateFor({ name: 'x', type: 'day_next_month', days: 20 }, '2026-12-05')).toBe('2027-01-20')
  })
  it('imports Xero terms', () => {
    expect(termFromXero({ Day: 30, Type: 'DAYSAFTERBILLDATE' })).toEqual({ name: 'Net 30', type: 'days', days: 30 })
    expect(termFromXero({ Day: 20, Type: 'OFFOLLOWINGMONTH' })?.name).toBe('20th of the following month')
    expect(termFromXero({ Day: 22, Type: 'OFCURRENTMONTH' })?.name).toBe('22nd of the current month')
    expect(termFromXero({ Day: 0, Type: 'DAYSAFTERBILLDATE' })?.name).toBe('Due on receipt')
    expect(termFromXero({ Day: 45, Type: 'DAYSAFTERBILLMONTH' })?.name).toBe('45 days after end of month')
    expect(termFromXero({ Day: 40, Type: 'OFCURRENTMONTH' })).toBeNull()
    expect(termFromXero({ Day: 5 })).toBeNull()
    expect(termFromXero(null)).toBeNull()
    expect(termName('day_next_month', 3)).toBe('3rd of the following month')
    expect(termName('day_current_month', 11)).toBe('11th of the current month')
  })
  it('validates what is typed in Settings', () => {
    expect(validateTerm({ name: '  Net  45 ', type: 'days', days: '45' })).toEqual({ value: { name: 'Net 45', type: 'days', days: 45 } })
    expect('error' in validateTerm({ name: '', type: 'days', days: 1 })).toBe(true)
    expect('error' in validateTerm({ name: 'x', type: 'nope', days: 1 })).toBe(true)
    expect('error' in validateTerm({ name: 'x', type: 'day_next_month', days: 0 })).toBe(true)
    expect('error' in validateTerm({ name: 'x', type: 'days', days: 1.5 })).toBe(true)
    expect(legacyTerm('Due on receipt')?.days).toBe(0)
  })
})
