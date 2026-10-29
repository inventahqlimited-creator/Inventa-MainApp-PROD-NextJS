import { describe, expect, it } from 'vitest'
import { keepKitLine, kitItemName } from './doc-lines'

const parent = { kit_group: 'g', is_kit_parent: true }
const item = { kit_group: 'g', is_kit_parent: false }

describe('keepKitLine', () => {
  it('always keeps ordinary lines', () => {
    for (const m of ['parent', 'both', 'components'] as const) expect(keepKitLine({}, m)).toBe(true)
    expect(keepKitLine(undefined, 'parent')).toBe(true)
  })
  it('kit only shows the kit line', () => { expect(keepKitLine(parent, 'parent')).toBe(true); expect(keepKitLine(item, 'parent')).toBe(false) })
  it('items only shows the items', () => { expect(keepKitLine(parent, 'components')).toBe(false); expect(keepKitLine(item, 'components')).toBe(true) })
  it('both shows everything', () => { expect(keepKitLine(parent, 'both')).toBe(true); expect(keepKitLine(item, 'both')).toBe(true) })
})
describe('kitItemName', () => {
  it('marks items only when shown under their kit', () => {
    expect(kitItemName('Pump', item, 'both')).toBe('↳ Pump')
    expect(kitItemName('Pump', item, 'components')).toBe('Pump')
    expect(kitItemName('Gift box', parent, 'both')).toBe('Gift box')
  })
})
