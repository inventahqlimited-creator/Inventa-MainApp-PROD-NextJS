import { describe, it, expect } from 'vitest'
import { normalizeSecurity, parseIpRule, ipMatchesRule, isIpAllowed, DEFAULT_SECURITY } from '@/lib/auth/security-settings'

describe('security settings', () => {
  it('defaults: audit on, 12h, no IP rules; bad input is cleaned', () => {
    expect(normalizeSecurity(null)).toEqual(DEFAULT_SECURITY)
    const s = normalizeSecurity({ audit_log_enabled: false, session_timeout_minutes: 5, ip_rules: [{ value: 'nope' }, { value: '10.0.0.1' }, { value: '10.0.0.1' }] })
    expect(s.audit_log_enabled).toBe(false)
    expect(s.session_timeout_minutes).toBe(720)
    expect(s.ip_rules.map(r => r.value)).toEqual(['10.0.0.1'])
  })
  it('parses addresses and ranges', () => {
    expect(parseIpRule(' 203.0.113.5 ')).toBe('203.0.113.5')
    expect(parseIpRule('203.0.113.0/24')).toBe('203.0.113.0/24')
    expect(parseIpRule('0.0.0.0/0')).toBeNull()
    expect(parseIpRule('1.2.3.4/33')).toBeNull()
    expect(parseIpRule('999.1.1.1')).toBeNull()
    expect(parseIpRule('2001:db8::1')).toBe('2001:db8::1')
    expect(parseIpRule('hello')).toBeNull()
  })
  it('matches ranges', () => {
    expect(ipMatchesRule('203.0.113.77', '203.0.113.0/24')).toBe(true)
    expect(ipMatchesRule('203.0.114.1', '203.0.113.0/24')).toBe(false)
    expect(ipMatchesRule('::ffff:10.0.0.1', '10.0.0.1')).toBe(true)
  })
  it('no rules allows everyone; rules block others and unknown', () => {
    expect(isIpAllowed({ ip_rules: [] }, 'unknown')).toBe(true)
    const s = normalizeSecurity({ ip_rules: [{ value: '10.0.0.0/8' }] })
    expect(isIpAllowed(s, '10.2.3.4')).toBe(true)
    expect(isIpAllowed(s, '8.8.8.8')).toBe(false)
    expect(isIpAllowed(s, 'unknown')).toBe(false)
  })
})
