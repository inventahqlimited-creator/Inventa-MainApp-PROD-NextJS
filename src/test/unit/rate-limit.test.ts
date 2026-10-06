import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, resetRateLimits, clientIp } from '@/lib/rate-limit'

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())
  it('allows up to the limit then blocks, with a retry time', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 1000, 100 + i).ok).toBe(true)
    const r = rateLimit('k', 3, 1000, 200)
    expect(r.ok).toBe(false)
    expect(r.retryAfter).toBeGreaterThan(0)
  })
  it('frees up after the window and keeps keys separate', () => {
    for (let i = 0; i < 3; i++) rateLimit('a', 3, 1000, 100)
    expect(rateLimit('a', 3, 1000, 100).ok).toBe(false)
    expect(rateLimit('b', 3, 1000, 100).ok).toBe(true)
    expect(rateLimit('a', 3, 1000, 1200).ok).toBe(true)
  })
  it('reads the client ip', () => {
    expect(clientIp(new Headers({ 'fly-client-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
    expect(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
