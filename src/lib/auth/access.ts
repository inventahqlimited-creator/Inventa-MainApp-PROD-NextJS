// src/lib/auth/access.ts
// Who is calling and what they may do. Used by every page and API route that needs a permission.
//   const g = await requirePerm('edit_sales')            // all of these
//   if ('res' in g) return g.res                         // 401 / 403 with a clear message
//   g.access.orgId, g.access.db, g.access.name …
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { homePath, resolvePermissions, type PermKey, type PermissionSet } from '@/lib/permissions'

export type Access = {
  userId: string
  orgId: string
  role: string
  isAdmin: boolean
  name: string | null
  email: string | null
  perms: PermissionSet
  db: ReturnType<typeof createAdminClient>
}

export async function getAccess(): Promise<Access | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: m } = await db
    .from('org_members')
    .select('org_id, role, custom_role_id, first_name, last_name')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (!m) return null
  const mem = m as { org_id: string; role: string; custom_role_id: string | null; first_name: string | null; last_name: string | null }

  let custom: Record<string, unknown> | null = null
  if (mem.role !== 'admin' && mem.custom_role_id) {
    const { data: r } = await db.from('org_roles').select('permissions').eq('id', mem.custom_role_id).eq('org_id', mem.org_id).maybeSingle()
    custom = ((r as { permissions?: Record<string, unknown> } | null)?.permissions) ?? {}
  }
  return {
    userId: user.id,
    orgId: mem.org_id,
    role: mem.role,
    isAdmin: mem.role === 'admin',
    name: [mem.first_name, mem.last_name].filter(Boolean).join(' ') || user.email || null,
    email: user.email ?? null,
    perms: resolvePermissions(mem.role, custom),
    db,
  }
}

export const can = (a: Pick<Access, 'perms'>, ...keys: PermKey[]) => keys.every(k => a.perms[k])
export const canAny = (a: Pick<Access, 'perms'>, ...keys: PermKey[]) => keys.some(k => a.perms[k])

const deny = (message = 'You don’t have permission to do that. Ask an admin to change your role.') =>
  NextResponse.json({ error: message }, { status: 403 })

/** For API routes. Needs ALL the keys. */
export async function requirePerm(...keys: PermKey[]): Promise<{ access: Access } | { res: NextResponse }> {
  const access = await getAccess()
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!can(access, ...keys)) return { res: deny() }
  return { access }
}

/** For API routes. Needs AT LEAST ONE of the keys. */
export async function requireAnyPerm(...keys: PermKey[]): Promise<{ access: Access } | { res: NextResponse }> {
  const access = await getAccess()
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canAny(access, ...keys)) return { res: deny() }
  return { access }
}

/**
 * For PATCH routes that both edit an order and cancel it.
 * A payload that only sets status "Cancelled" needs the cancel permission; anything else needs the edit permission.
 * A payload that does both needs both. Reads a copy of the body, so the route can still read it.
 */
export async function requireEditOrCancel(request: Request, edit: PermKey, cancel: PermKey): Promise<{ access: Access } | { res: NextResponse }> {
  const access = await getAccess()
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const body = (await request.clone().json().catch(() => null)) as Record<string, unknown> | null
  const status = typeof body?.status === 'string' ? body.status.toLowerCase() : null
  const cancelling = status === 'cancelled'
  const editing = !cancelling || Object.keys(body ?? {}).some(k => k !== 'status')
  if (cancelling && !can(access, cancel)) return { res: deny() }
  if (editing && !can(access, edit)) return { res: deny() }
  return { access }
}

/** For API routes that are admin only (connecting Xero, for instance). */
export async function requireAdmin(): Promise<{ access: Access } | { res: NextResponse }> {
  const access = await getAccess()
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!access.isAdmin) return { res: deny('Only admins can do that.') }
  return { access }
}

/**
 * For pages (server components). Needs ALL the keys; otherwise sends the person to the first screen they may open.
 * Pass `any: true` to need at least one.
 */
export async function pageAccess(keys: PermKey[], opts: { any?: boolean } = {}): Promise<Access> {
  const access = await getAccess()
  if (!access) redirect('/login')
  const ok = opts.any ? canAny(access, ...keys) : can(access, ...keys)
  if (!ok) redirect(homePath(access.perms))
  return access
}

export { deny as denyResponse }
