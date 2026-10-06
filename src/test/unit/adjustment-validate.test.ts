import { describe, it, expect } from 'vitest'
import { cleanAdjustment } from '@/lib/adjustments/validate'

const P = '00000000-0000-0000-0000-000000000002'
describe('cleanAdjustment', () => {
  it('keeps only allowed fields and renumbers lines', () => {
    const r = cleanAdjustment({ location_id: P, status: 'Completed', org_id: 'x', lines: [{ product_id: P, quantity_before: 1, quantity_after: 3, unit_cost: 99, org_id: 'x' }] })
    expect(r.error).toBeUndefined()
    if ('header' in r) {
      expect(r.header).toEqual({ location_id: P })
      expect(r.lines).toEqual([{ product_id: P, quantity_before: 1, quantity_after: 3, sort_order: 0 }])
    }
  })
  it('rejects bad quantities and products', () => {
    expect(cleanAdjustment({ lines: [{ product_id: P, quantity_before: 'a', quantity_after: 1 }] }).error).toMatch(/numbers/)
    expect(cleanAdjustment({ lines: [{ product_id: P, quantity_before: 1, quantity_after: -1 }] }).error).toMatch(/negative/)
    expect(cleanAdjustment({ lines: [{ product_id: 'x', quantity_before: 1, quantity_after: 1 }] }).error).toMatch(/product/)
    expect(cleanAdjustment(null).error).toBeTruthy()
  })
})
