import { describe, expect, it } from 'vitest'
import { guideTotal, kitCost, parseBomLines, productCost } from './bom'
import { normalizeAddons, parseAddonsPatch } from '../addons'

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'

describe('parseBomLines', () => {
  it('accepts good lines and rounds', () => {
    const r = parseBomLines([{ component_id: A, quantity: '2', guide_price: 1.5 }, { component_id: B, quantity: 0.5 }])
    expect(r).toEqual({ ok: true, lines: [{ component_id: A, quantity: 2, guide_price: 1.5 }, { component_id: B, quantity: 0.5, guide_price: null }] })
  })
  it('explains problems in plain words', () => {
    expect(parseBomLines('x')).toMatchObject({ ok: false })
    expect(parseBomLines([{ component_id: 'nope', quantity: 1 }])).toMatchObject({ ok: false, error: expect.stringMatching(/choose an item/) })
    expect(parseBomLines([{ component_id: A, quantity: 0 }])).toMatchObject({ ok: false, error: expect.stringMatching(/greater than zero/) })
    expect(parseBomLines([{ component_id: A, quantity: 1 }, { component_id: A, quantity: 2 }])).toMatchObject({ ok: false, error: expect.stringMatching(/already in the list/) })
    expect(parseBomLines([{ component_id: A, quantity: 1, guide_price: -1 }])).toMatchObject({ ok: false, error: expect.stringMatching(/negative/) })
  })
  it('allows an empty list', () => { expect(parseBomLines([])).toEqual({ ok: true, lines: [] }) })
})

describe('cost and guide totals', () => {
  it('kit cost = sum of cost x qty', () => { expect(kitCost([{ quantity: 2, cost: 0.55 }, { quantity: 1, cost: 3 }])).toBe(4.1) })
  it('guide uses the override, else the current selling price', () => {
    expect(guideTotal([{ quantity: 2, guide_price: 1.5, sell_price: 9 }, { quantity: 1, guide_price: null, sell_price: 4 }])).toBe(7)
  })
  it('product cost: average, then last, then cost price', () => {
    expect(productCost({ avg_cost: 2, last_cost: 3, cost_price: 4 })).toBe(2)
    expect(productCost({ avg_cost: 0, last_cost: 3, cost_price: 4 })).toBe(3)
    expect(productCost({ cost_price: '4' })).toBe(4)
    expect(productCost({})).toBe(0)
  })
})

describe('add-ons', () => {
  it('everything is off unless exactly true', () => {
    expect(normalizeAddons(null)).toEqual({ kits: false })
    expect(normalizeAddons({ kits: 'yes' })).toEqual({ kits: false })
    expect(normalizeAddons({ kits: true, other: true })).toEqual({ kits: true })
  })
  it('Hub patches accept only known boolean switches', () => {
    expect(parseAddonsPatch({ kits: true })).toEqual({ kits: true })
    expect(parseAddonsPatch({ nope: true })).toBeUndefined()
    expect(parseAddonsPatch({ kits: 'on' })).toBeUndefined()
    expect(parseAddonsPatch([])).toBeUndefined()
  })
})
