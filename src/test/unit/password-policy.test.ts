import { describe, it, expect } from 'vitest'
import { normalizePolicy, checkPassword, isPasswordExpired, DEFAULT_POLICY } from '@/lib/auth/password-policy'

const DAY = 86_400_000
describe('password policy', () => {
  it('defaults are off and clean bad input', () => {
    expect(normalizePolicy(null)).toEqual(DEFAULT_POLICY)
    const p = normalizePolicy({ rotation: { enabled: true, days: 7 }, strength: { min_length: 2 } })
    expect(p.rotation.days).toBe(90)
    expect(p.strength.min_length).toBe(8)
    expect(normalizePolicy({ strength: { min_length: 999 } }).strength.min_length).toBe(64)
  })
  it('checks strength only when enabled, always 8 chars', () => {
    expect(checkPassword('abcdefgh', DEFAULT_POLICY)).toEqual([])
    expect(checkPassword('abc', DEFAULT_POLICY)).toHaveLength(1)
    const p = normalizePolicy({ strength: { enabled: true, min_length: 12, upper: true, lower: true, number: true, special: true } })
    expect(checkPassword('abcdefghijkl', p)).toHaveLength(3)
    expect(checkPassword('Abcdefghij1!', p)).toEqual([])
  })
  it('expires by age, counting from switch-on for old passwords', () => {
    const now = Date.parse('2026-10-06T00:00:00Z')
    const on = new Date(now - 10 * DAY).toISOString()
    const p = normalizePolicy({ rotation: { enabled: true, days: 30, enabled_at: on } })
    expect(isPasswordExpired(p, null, now)).toBe(false)
    expect(isPasswordExpired(p, new Date(now - 400 * DAY).toISOString(), now)).toBe(false)
    expect(isPasswordExpired(p, null, now + 25 * DAY)).toBe(true)
    expect(isPasswordExpired(p, new Date(now - 5 * DAY).toISOString(), now + 20 * DAY)).toBe(false)
    expect(isPasswordExpired(DEFAULT_POLICY, null, now)).toBe(false)
  })
})
