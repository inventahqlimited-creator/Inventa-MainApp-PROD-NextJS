import { describe, expect, it } from 'vitest'
import { virtualStock } from './virtual-stock'

const stock: Record<string, number | null> = { a: 10, b: 7, svc: null }
const has = (id: string) => (id in stock ? stock[id] : 0)

describe('virtualStock', () => {
  it('is limited by the item that runs out first', () => {
    expect(virtualStock([{ component_id: 'a', quantity: 2 }, { component_id: 'b', quantity: 3 }], has)).toBe(2)
  })
  it('rounds down to whole kits', () => { expect(virtualStock([{ component_id: 'a', quantity: 4 }], has)).toBe(2) })
  it('ignores services and non-stock items', () => {
    expect(virtualStock([{ component_id: 'a', quantity: 5 }, { component_id: 'svc', quantity: 1 }], has)).toBe(2)
  })
  it('has no value when nothing in the kit is stocked', () => { expect(virtualStock([{ component_id: 'svc', quantity: 1 }], has)).toBeNull() })
  it('never goes below zero', () => { expect(virtualStock([{ component_id: 'a', quantity: 1 }], () => -3)).toBe(0) })
})
