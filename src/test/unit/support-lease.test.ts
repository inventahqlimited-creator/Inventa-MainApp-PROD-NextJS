import { describe, it, expect } from 'vitest'
import { leaseValid, sweepExpired, endSupport } from '@/lib/hub/support-lease'

// tiny in-memory stand-in for the three tables the lease code touches
function fakeDb(leases: Record<string, string>) {
  const calls: string[] = []
  const db = {
    calls,
    from: (t: string) => ({
      select: () => ({
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: leases[id] ? { lease_until: leases[id] } : null }) }),
        lt: (_c: string, now: string) => ({ limit: async () => ({ data: Object.entries(leases).filter(([, v]) => v < now).map(([user_id]) => ({ user_id })) }) }),
      }),
      update: (v: unknown) => ({ eq: async (_c: string, id: string) => { calls.push(`${t}.update:${id}:${JSON.stringify(v)}`); return {} } }),
      delete: () => ({ eq: async (_c: string, id: string) => { calls.push(`${t}.delete:${id}`); delete leases[id]; return {} } }),
    }),
    auth: { admin: { updateUserById: async (id: string, v: { ban_duration: string }) => { calls.push(`ban:${id}:${v.ban_duration}`); return {} } } },
  }
  return db
}
const future = () => new Date(Date.now() + 60_000).toISOString()
const past = () => new Date(Date.now() - 60_000).toISOString()

describe('support lease', () => {
  it('is valid only while the lease is in the future', async () => {
    const db = fakeDb({ a: future(), b: past() })
    expect(await leaseValid(db, 'a')).toBe(true)
    expect(await leaseValid(db, 'b')).toBe(false)
    expect(await leaseValid(db, 'nobody')).toBe(false)
  })
  it('ending a session switches the membership off, blocks the login and removes the lease', async () => {
    const db = fakeDb({ a: future() })
    await endSupport(db, 'a')
    expect(db.calls).toContain('org_members.update:a:{"invite_status":"inactive"}')
    expect(db.calls).toContain('ban:a:876000h')
    expect(db.calls).toContain('support_sessions.delete:a')
  })
  it('sweeps only lapsed sessions', async () => {
    const db = fakeDb({ live: future(), dead: past() })
    expect(await sweepExpired(db)).toBe(1)
    expect(db.calls.some(c => c.includes(':dead'))).toBe(true)
    expect(db.calls.some(c => c.includes(':live'))).toBe(false)
  })
})
