import { describe, expect, it, vi } from 'vitest'
import { sendInvite, IN_USE_MESSAGE } from './send-invite'

const taken = { message: 'A user with this email address has already been registered', code: 'email_exists' }
function db(opts: { users?: { id: string; email: string }[]; memberships?: number; inviteResults: ({ error: unknown })[] }) {
  const invite = vi.fn()
  opts.inviteResults.forEach(r => invite.mockResolvedValueOnce(r))
  const deleteUser = vi.fn().mockResolvedValue({ error: null })
  return {
    invite, deleteUser,
    db: {
      from: () => ({ select: () => ({ eq: () => Promise.resolve({ count: opts.memberships ?? 0 }) }) }),
      auth: { admin: { inviteUserByEmail: invite, deleteUser, listUsers: vi.fn().mockResolvedValue({ data: { users: opts.users ?? [] }, error: null }) } },
    },
  }
}
const o = { redirectTo: 'x', data: {} }

describe('sendInvite', () => {
  it('invites normally', async () => {
    const t = db({ inviteResults: [{ error: null }] })
    expect(await sendInvite(t.db, 'a@b.co', o)).toEqual({ ok: true })
    expect(t.deleteUser).not.toHaveBeenCalled()
  })
  it('clears a leftover login that belongs to no organisation and invites again', async () => {
    const t = db({ users: [{ id: 'u1', email: 'A@b.co' }], memberships: 0, inviteResults: [{ error: taken }, { error: null }] })
    expect(await sendInvite(t.db, 'a@b.co', o)).toEqual({ ok: true })
    expect(t.deleteUser).toHaveBeenCalledWith('u1')
    expect(t.invite).toHaveBeenCalledTimes(2)
  })
  it('never touches a login that belongs to an organisation', async () => {
    const t = db({ users: [{ id: 'u1', email: 'a@b.co' }], memberships: 1, inviteResults: [{ error: taken }] })
    const r = await sendInvite(t.db, 'a@b.co', o)
    expect(r).toMatchObject({ ok: false, status: 409, error: IN_USE_MESSAGE })
    expect(t.deleteUser).not.toHaveBeenCalled()
  })
  it('gives a friendly message for other failures', async () => {
    const t = db({ inviteResults: [{ error: { message: 'smtp down' } }] })
    const r = await sendInvite(t.db, 'a@b.co', o)
    expect(r).toMatchObject({ ok: false, status: 500 })
  })
})
