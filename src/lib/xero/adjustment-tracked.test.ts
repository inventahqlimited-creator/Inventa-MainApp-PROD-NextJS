import { describe, it, expect } from 'vitest'
import { buildTrackedDocs } from './adjustment'

const l = (name: string, delta: number, cost: number) => ({ name, sku: name.toUpperCase(), unit: 'ea', delta, cost })

describe('buildTrackedDocs', () => {
  it('puts increases on a bill and decreases on a credit note', () => {
    const { bill, credit } = buildTrackedDocs([l('a', 5, 2), l('b', -3, 1.5), l('c', 0, 9)])
    expect(bill?.lines.map(x => x.name)).toEqual(['a'])
    expect(bill?.totalCents).toBe(1000)
    expect(credit?.lines[0].qty).toBe(3)
    expect(credit?.totalCents).toBe(450)
  })
  it('returns null for a side with no lines', () => {
    const r = buildTrackedDocs([l('a', 2, 1)])
    expect(r.credit).toBeNull()
    expect(buildTrackedDocs([]).bill).toBeNull()
  })
  it('rounds line amounts to cents', () => {
    expect(buildTrackedDocs([l('a', 3, 0.3333)]).bill?.totalCents).toBe(100)
  })
})
