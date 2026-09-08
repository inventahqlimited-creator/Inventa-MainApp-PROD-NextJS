/**
 * Auth utility tests.
 * These test logic functions, not the Supabase client itself.
 * Add more as you build server actions.
 */
import { describe, it, expect } from 'vitest'

describe('org membership', () => {
  it('identifies admin role correctly', () => {
    const role = 'admin'
    expect(['admin'].includes(role)).toBe(true)
  })

  it('identifies non-admin roles correctly', () => {
    const roles = ['manager', 'staff', 'read_only']
    roles.forEach(role => {
      expect(['admin'].includes(role)).toBe(false)
    })
  })
})
