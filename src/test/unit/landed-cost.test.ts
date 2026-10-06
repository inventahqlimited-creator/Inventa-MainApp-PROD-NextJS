import { describe, it, expect } from 'vitest'
import { allocateLandedCost, normalizeMethod } from '@/lib/purchases/landed-cost'

const lines = [
  { id: 'a', qty: 10, unitCost: 10 },            // value 100, 10 units
  { id: 'b', qty: 30, unitCost: 10, discount: 0 }, // value 300, 30 units
]
describe('landed cost', () => {
  it('by value', () => {
    const r = allocateLandedCost('value', 40, lines)
    expect(r.map(x => x.allocated)).toEqual([10, 30])
    expect(r[0].extraPerUnit).toBeCloseTo(1)
    expect(r[1].extraPerUnit).toBeCloseTo(1)
  })
  it('by quantity differs when prices differ', () => {
    const l = [{ id: 'a', qty: 10, unitCost: 100 }, { id: 'b', qty: 10, unitCost: 1 }]
    expect(allocateLandedCost('value', 100, l).map(x => Math.round(x.allocated))).toEqual([99, 1])
    expect(allocateLandedCost('quantity', 100, l).map(x => x.allocated)).toEqual([50, 50])
  })
  it('uses line discount and buy-unit factor', () => {
    const r = allocateLandedCost('quantity', 60, [{ id: 'a', qty: 1, unitCost: 5, factor: 12 }, { id: 'b', qty: 48, unitCost: 5, discount: 50 }])
    expect(r[0].allocated).toBeCloseTo(12) // 12 of 60 units
    expect(r[0].extraPerUnit).toBeCloseTo(1)
    expect(allocateLandedCost('value', 30, [{ id: 'a', qty: 2, unitCost: 10, discount: 50 }, { id: 'b', qty: 2, unitCost: 10 }]).map(x => x.allocated)).toEqual([10, 20])
  })
  it('nothing to spread, or nothing to spread over', () => {
    expect(allocateLandedCost('value', 0, lines).every(x => x.allocated === 0)).toBe(true)
    expect(allocateLandedCost('value', 10, []).length).toBe(0)
    expect(allocateLandedCost('value', 10, [{ id: 'a', qty: 5, unitCost: 0 }])[0].allocated).toBe(10) // free goods fall back to quantity
  })
  it('allocations add up to the extra cost', () => {
    const r = allocateLandedCost('value', 123.45, [{ id: 'a', qty: 3, unitCost: 7.77 }, { id: 'b', qty: 9, unitCost: 1.13 }, { id: 'c', qty: 1, unitCost: 99 }])
    expect(r.reduce((s, x) => s + x.allocated, 0)).toBeCloseTo(123.45, 8)
  })
  it('old weight setting becomes value', () => {
    expect(normalizeMethod('weight')).toBe('value')
    expect(normalizeMethod('quantity')).toBe('quantity')
    expect(normalizeMethod(undefined)).toBe('value')
  })
})
