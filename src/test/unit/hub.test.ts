import { describe, it, expect } from 'vitest'
import { addMonths, planLabel } from '@/lib/hub/constants'
import { checkSeatLimit } from '@/lib/hub/seats'

// minimal fake of the two queries checkSeatLimit makes
function fakeDb(limit: number | null, used: number) {
  return {
    from: (t: string) => t === 'organisations'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: limit === null ? null : { user_limit: limit }, error: limit === null ? { message: 'no column' } : null }) }) }) }
      : { select: () => ({ eq: () => ({ in: async () => ({ count: used }) }) }) },
  }
}

describe('hub helpers', () => {
  it('adds months and clamps month ends', () => {
    expect(addMonths('2026-10-07', 1)).toBe('2026-11-07')
    expect(addMonths('2026-10-07', 12)).toBe('2027-10-07')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-10-07', 36)).toBe('2029-10-07')
  })
  it('labels plans', () => { expect(planLabel('2_year')).toBe('2 year'); expect(planLabel(null)).toBe('—') })
  it('blocks at the limit with the sales message', async () => {
    const r = await checkSeatLimit(fakeDb(3, 3), 'o')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe('Your plan only allows 3 users. Please contact sales to add more.')
  })
  it('allows below the limit, and when the column is missing', async () => {
    expect((await checkSeatLimit(fakeDb(3, 2), 'o')).ok).toBe(true)
    expect((await checkSeatLimit(fakeDb(null, 9), 'o')).ok).toBe(true)
  })
})
