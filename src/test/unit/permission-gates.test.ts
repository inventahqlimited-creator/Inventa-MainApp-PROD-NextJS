import { describe, it, expect, vi, beforeEach } from 'vitest'

let member: Record<string, unknown> | null = null
const chain = (result: () => unknown): unknown => {
  const handler: ProxyHandler<object> = {
    get: (_t, prop) => {
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: result(), error: null })
      return () => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.co' } } }) } }),
  createAdminClient: () => ({ from: (t: string) => chain(() => (t === 'org_members' ? member : null)) }),
}))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { requirePerm, requireEditOrCancel } from '@/lib/auth/access'

const req = (body: unknown) => new Request('http://x/api', { method: 'PATCH', body: JSON.stringify(body) })
const m = (role: string) => { member = { org_id: 'o1', role, custom_role_id: null, first_name: 'A', last_name: 'B' } }
const ok = (r: object) => 'access' in r
const status = (r: { res?: Response }) => r.res?.status

beforeEach(() => { member = null })

describe('requirePerm', () => {
  it('lets staff create sales but not manage settings', async () => {
    m('staff')
    expect(ok(await requirePerm('create_sales'))).toBe(true)
    const denied = await requirePerm('manage_company')
    expect(ok(denied)).toBe(false)
    expect(status(denied as { res: Response })).toBe(403)
  })
  it('read only cannot change anything', async () => {
    m('read_only')
    expect(ok(await requirePerm('view_sales'))).toBe(true)
    expect(ok(await requirePerm('create_sales'))).toBe(false)
    expect(ok(await requirePerm('close_sales'))).toBe(false)
  })
  it('admin can do everything; unknown user gets 401', async () => {
    m('admin')
    expect(ok(await requirePerm('manage_roles', 'close_sales', 'xero_settings'))).toBe(true)
    member = null
    expect(status((await requirePerm('view_sales')) as { res: Response })).toBe(401)
  })
})

describe('requireEditOrCancel', () => {
  it('staff can edit but not cancel', async () => {
    m('staff')
    expect(ok(await requireEditOrCancel(req({ notes: 'x' }), 'edit_sales', 'cancel_sales'))).toBe(true)
    expect(ok(await requireEditOrCancel(req({ status: 'Open' }), 'edit_sales', 'cancel_sales'))).toBe(true)
    expect(ok(await requireEditOrCancel(req({ status: 'Cancelled' }), 'edit_sales', 'cancel_sales'))).toBe(false)
    expect(ok(await requireEditOrCancel(req({ status: 'Cancelled', notes: 'x' }), 'edit_sales', 'cancel_sales'))).toBe(false)
  })
  it('manager can cancel; read only cannot edit', async () => {
    m('manager')
    expect(ok(await requireEditOrCancel(req({ status: 'Cancelled' }), 'edit_sales', 'cancel_sales'))).toBe(true)
    m('read_only')
    expect(ok(await requireEditOrCancel(req({ notes: 'x' }), 'edit_sales', 'cancel_sales'))).toBe(false)
  })
})
