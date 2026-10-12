import { describe, it, expect } from 'vitest'
import { xeroDueDate } from '@/lib/xero/invoice'
import { termForContact } from '@/lib/xero/terms'
import { DEFAULT_TERMS, type PaymentTerm } from '@/lib/payment-terms'

const list: PaymentTerm[] = [...DEFAULT_TERMS, { name: '20th of next month', type: 'day_next_month', days: 20 }]

describe('xeroDueDate', () => {
  it('uses the org table for rule-based terms', () => {
    expect(xeroDueDate('20th of next month', '2026-10-12', list)).toBe('2026-11-20')
    expect(xeroDueDate('Net 30', '2026-10-12', list)).toBe('2026-11-11')
  })
  it('falls back to the old Net N reading and returns null for unknown terms', () => {
    expect(xeroDueDate('Net 45', '2026-10-12', [])).toBe('2026-11-26')
    expect(xeroDueDate('whenever', '2026-10-12', list)).toBeNull()
    expect(xeroDueDate('', '2026-10-12', list)).toBeNull()
  })
})

describe('termForContact', () => {
  const pt = { Sales: { Day: 14, Type: 'DAYSAFTERBILLDATE' }, Bills: { Day: 20, Type: 'OFFOLLOWINGMONTH' } }
  it('uses Sales terms for customers and Bills terms for suppliers', () => {
    expect(termForContact({ IsCustomer: true, PaymentTerms: pt })?.name).toBe('Net 14')
    expect(termForContact({ IsSupplier: true, PaymentTerms: pt })?.name).toBe('20th of the following month')
  })
  it('returns null when Xero has no terms', () => {
    expect(termForContact({ IsCustomer: true })).toBeNull()
  })
})
