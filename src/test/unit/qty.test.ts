import { describe, it, expect } from 'vitest'
import { fmtQty, fmtQtyPlain, qtyFmtFromOrg, roundQty, qtyStep, WHOLE_QTY } from '@/lib/qty'

describe('quantity format', () => {
  const dec = qtyFmtFromOrg({ decimal_qty: true, decimal_qty_places: 2 })
  it('reads the organisation settings', () => {
    expect(qtyFmtFromOrg(null)).toEqual(WHOLE_QTY)
    expect(qtyFmtFromOrg({ decimal_qty: false, decimal_qty_places: 3 })).toEqual(WHOLE_QTY)
    expect(dec).toEqual({ decimals: true, places: 2 })
    expect(qtyFmtFromOrg({ decimal_qty: true }).places).toBe(2)
    expect(qtyFmtFromOrg({ decimal_qty: true, decimal_qty_places: 9 }).places).toBe(4)
  })
  it('shows decimals only when enabled', () => {
    expect(fmtQty(1, dec)).toBe('1.00')
    expect(fmtQty(1234.5, dec)).toBe('1,234.50')
    expect(fmtQty(1, WHOLE_QTY)).toBe('1')
    expect(fmtQty('3', WHOLE_QTY)).toBe('3')
    expect(fmtQty(null, dec)).toBe('')
  })
  it('serial products are always whole; old fractions are not hidden', () => {
    expect(fmtQty(2, dec, true)).toBe('2')
    expect(fmtQty(1.5, WHOLE_QTY)).toBe('1.5')
  })
  it('plain, rounding and step', () => {
    expect(fmtQtyPlain(1234.5, dec)).toBe('1234.50')
    expect(roundQty(1.236, dec)).toBe(1.24)
    expect(roundQty(1.6, WHOLE_QTY)).toBe(2)
    expect(qtyStep(dec)).toBe(0.01)
    expect(qtyStep(WHOLE_QTY)).toBe(1)
  })
})
