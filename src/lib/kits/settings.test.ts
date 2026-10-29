import { describe, it, expect } from 'vitest'
import { DEFAULT_KIT_SETTINGS, normalizeKitSettings } from './settings'

describe('normalizeKitSettings', () => {
  it('gives the defaults for nothing or rubbish', () => {
    expect(normalizeKitSettings(null)).toEqual(DEFAULT_KIT_SETTINGS)
    expect(normalizeKitSettings('x')).toEqual(DEFAULT_KIT_SETTINGS)
    expect(normalizeKitSettings([])).toEqual(DEFAULT_KIT_SETTINGS)
    expect(normalizeKitSettings({})).toEqual(DEFAULT_KIT_SETTINGS)
  })
  it('keeps valid values and ignores invalid ones', () => {
    const s = normalizeKitSettings({ expand_sales: false, show_virtual_stock: true, docs: { invoice: 'both', pick_list: 'nope', other: 'parent' } })
    expect(s.expand_sales).toBe(false)
    expect(s.expand_purchase).toBe(true)
    expect(s.show_virtual_stock).toBe(true)
    expect(s.docs.invoice).toBe('both')
    expect(s.docs.pick_list).toBe('components')
    expect((s.docs as Record<string, string>).other).toBeUndefined()
  })
  it('does not share the defaults object', () => {
    const a = normalizeKitSettings({}); a.docs.invoice = 'components'
    expect(DEFAULT_KIT_SETTINGS.docs.invoice).toBe('parent')
  })
})
