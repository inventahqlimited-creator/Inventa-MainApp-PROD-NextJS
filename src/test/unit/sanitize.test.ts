import { describe, it, expect } from 'vitest'
import { pick, CONTACT_FIELDS, badForeignKey } from '@/lib/api/sanitize'
import { isUuid, isEmail, isFixedRole } from '@/lib/auth/platform-admin'

describe('pick', () => {
  it('drops org_id, id and unknown keys', () => {
    const out = pick({ name: 'A', org_id: 'x', id: 'y', created_at: 'z', evil: 1 }, CONTACT_FIELDS)
    expect(out).toEqual({ name: 'A' })
  })
  it('rejects non-objects', () => {
    expect(pick(null, CONTACT_FIELDS)).toBeNull()
    expect(pick([1], CONTACT_FIELDS)).toBeNull()
    expect(pick('x', CONTACT_FIELDS)).toBeNull()
  })
})

describe('validators', () => {
  it('uuid / email / role', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000001')).toBe(true)
    expect(isUuid('nope')).toBe(false)
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('a b@c')).toBe(false)
    expect(isFixedRole('staff')).toBe(true)
    expect(isFixedRole('owner')).toBe(false)
  })
})

describe('badForeignKey', () => {
  const dbWith = (found: boolean) => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: found ? { id: 1 } : null }) }) }) }) }) })
  it('flags ids from another org and malformed ids', async () => {
    expect(await badForeignKey(dbWith(false), 'o', { a: '00000000-0000-0000-0000-000000000002' }, { a: 'contacts' })).toBe('a')
    expect(await badForeignKey(dbWith(true), 'o', { a: 'not-a-uuid' }, { a: 'contacts' })).toBe('a')
    expect(await badForeignKey(dbWith(true), 'o', { a: '00000000-0000-0000-0000-000000000002' }, { a: 'contacts' })).toBeNull()
    expect(await badForeignKey(dbWith(false), 'o', {}, { a: 'contacts' })).toBeNull()
  })
})
