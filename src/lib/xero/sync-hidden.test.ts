import { describe, expect, it } from 'vitest'
import { isHiddenProductName } from './sync'

describe('isHiddenProductName', () => {
  it('hides names that start with zz, any case, ignoring leading spaces', () => {
    for (const n of ['zz old widget', 'ZZ Old Widget', 'Zz-retired', '  zzTest', 'zz']) expect(isHiddenProductName(n)).toBe(true)
  })
  it('keeps everything else', () => {
    for (const n of ['Widget', 'Jazz band', 'azz', 'z z widget', 'z', '', null, undefined]) expect(isHiddenProductName(n)).toBe(false)
  })
})
