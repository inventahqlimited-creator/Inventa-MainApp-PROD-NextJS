import { describe, it, expect } from 'vitest'
import { sessionOnly } from '@/lib/auth/session-cookies'

describe('sessionOnly', () => {
  it('drops the lifetime so the cookie ends when the browser closes', () => {
    const out = sessionOnly({ path: '/', sameSite: 'lax' as const, maxAge: 400 * 86400, expires: new Date(Date.now() + 86400_000) })
    expect(out).toEqual({ path: '/', sameSite: 'lax' })
  })
  it('keeps deletions working (maxAge 0 or an expiry in the past)', () => {
    expect(sessionOnly({ path: '/', maxAge: 0 })).toEqual({ path: '/', maxAge: 0 })
    const past = new Date(0)
    expect(sessionOnly({ path: '/', expires: past })).toEqual({ path: '/', expires: past })
  })
  it('leaves missing options alone', () => {
    expect(sessionOnly(undefined)).toBeUndefined()
  })
})
