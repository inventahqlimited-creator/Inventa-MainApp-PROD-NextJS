// src/lib/auth/send-invite.ts
// Sends an invite email, and copes with an address that already has a login.
//
// Removing someone from an organisation leaves their login behind (blocked), and Supabase refuses to invite an address that has
// a login ("already registered"). A leftover login that belongs to NO organisation is safe to clear away, so we delete it and
// invite again. A login that belongs to an organisation is never touched: that address is genuinely in use.
// Old orders keep their history (their created_by link just becomes empty).
type Db = { from: (t: string) => any; auth: { admin: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

export type InviteResult = { ok: true } | { ok: false; status: number; error: string }

const isTaken = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === 'email_exists' || /already (been )?registered|already exists|email_exists/i.test(e.message ?? ''))

export const IN_USE_MESSAGE = 'That email already has an InventaHQ account in an organisation. Use a different email address.'

async function findLoginByEmail(db: Db, email: string): Promise<{ id: string } | null> {
  const want = email.toLowerCase()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const users = (data?.users ?? []) as { id: string; email?: string | null }[]
    const hit = users.find(u => (u.email ?? '').toLowerCase() === want)
    if (hit) return hit
    if (users.length < 1000) return null
  }
  return null
}

export async function sendInvite(db: Db, email: string, opts: { redirectTo: string; data: Record<string, unknown> }): Promise<InviteResult> {
  const first = await db.auth.admin.inviteUserByEmail(email, opts)
  if (!first.error) return { ok: true }
  if (!isTaken(first.error)) return { ok: false, status: 500, error: 'The invitation email could not be sent. Please try again.' }

  const login = await findLoginByEmail(db, email)
  if (!login) return { ok: false, status: 409, error: IN_USE_MESSAGE }
  const { count } = await db.from('org_members').select('id', { count: 'exact', head: true }).eq('user_id', login.id)
  if ((count ?? 0) > 0) return { ok: false, status: 409, error: IN_USE_MESSAGE }

  const del = await db.auth.admin.deleteUser(login.id)
  if (del.error) return { ok: false, status: 500, error: 'That email has an old account that could not be cleared. Please contact support.' }
  const again = await db.auth.admin.inviteUserByEmail(email, opts)
  if (again.error) return { ok: false, status: 500, error: 'The invitation email could not be sent. Please try again.' }
  return { ok: true }
}
