import { describe, it, expect } from 'vitest'
import { redirectTo } from '@/lib/auth/redirect'

describe('redirectTo', () => {
  it('uses a relative Location so the browser keeps the real site address', () => {
    const r = redirectTo('/login?error=session_timeout')
    expect(r.status).toBe(307)
    expect(r.headers.get('location')).toBe('/login?error=session_timeout')
  })
  it('never redirects off-site', () => {
    expect(redirectTo('//evil.com').headers.get('location')).toBe('/')
    expect(redirectTo('https://evil.com').headers.get('location')).toBe('/')
    expect(redirectTo('/\\evil.com').headers.get('location')).toBe('/')
  })
})
