import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { logHub } from '@/lib/hub/activity'
import { isUuid, isFixedRole } from '@/lib/auth/platform-admin'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const { id, mid } = await params
  if (!isUuid(id) || !isUuid(mid)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const { data: t } = await g.db.from('org_members').select('id, role, first_name, last_name, email').eq('id', mid).eq('org_id', id).maybeSingle()
  if (!t) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const m = t as { role: string; first_name: string | null; last_name: string | null; email: string | null }

  const update: Record<string, string | null> = {}
  if (typeof b.first_name === 'string') {
    const f = b.first_name.trim().slice(0, 80)
    if (!f) return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    update.first_name = f
  }
  if (typeof b.last_name === 'string') update.last_name = b.last_name.trim().slice(0, 80) || null
  if (b.role !== undefined) {
    if (!isFixedRole(b.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    update.role = b.role as string
    if (b.role === 'admin') update.custom_role_id = null
  }
  const changed = Object.entries(update).filter(([k, v]) => k !== 'custom_role_id' && (m as Record<string, unknown>)[k] !== v)
  if (changed.length === 0) return NextResponse.json({ success: true })

  // never leave an organisation without an administrator
  if (m.role === 'admin' && update.role && update.role !== 'admin') {
    const { count } = await g.db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', id).eq('role', 'admin').eq('invite_status', 'accepted')
    if ((count ?? 0) <= 1) return NextResponse.json({ error: 'This is the only administrator — make someone else an administrator first.' }, { status: 400 })
  }

  const { error } = await g.db.from('org_members').update(update).eq('id', mid).eq('org_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const who = m.email ?? 'user'
  const parts = changed.map(([k, v]) => `${k.replace('_', ' ')}: ${(m as Record<string, unknown>)[k] ?? 'blank'} → ${v ?? 'blank'}`)
  await logHub(g.db, { orgId: id, actorId: g.user.id, actorEmail: g.user.email, action: 'user.updated', summary: `Edited user ${who} (${parts.join('; ')})`, details: { member: mid, changes: Object.fromEntries(changed) } })
  return NextResponse.json({ success: true })
}

/** Removes a person from an organisation. Someone who never signed in has their unused login deleted, so the address can be invited again;
 *  someone who has used the app is only blocked from signing in (their history stays). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const { id, mid } = await params
  if (!isUuid(id) || !isUuid(mid)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  const { data: t } = await g.db.from('org_members').select('id, role, email, user_id, invite_status').eq('id', mid).eq('org_id', id).maybeSingle()
  if (!t) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const m = t as { role: string; email: string | null; user_id: string | null; invite_status: string }

  // never leave an organisation without an administrator
  if (m.role === 'admin' && m.invite_status === 'accepted') {
    const { count } = await g.db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', id).eq('role', 'admin').eq('invite_status', 'accepted')
    if ((count ?? 0) <= 1) return NextResponse.json({ error: 'This is the only administrator — make someone else an administrator before removing them.' }, { status: 400 })
  }

  const { error } = await g.db.from('org_members').delete().eq('id', mid).eq('org_id', id)
  if (error) return NextResponse.json({ error: 'Could not remove this user. Please try again.' }, { status: 500 })

  if (m.user_id) {
    // does this person belong to any other organisation?
    const { count: others } = await g.db.from('org_members').select('id', { count: 'exact', head: true }).eq('user_id', m.user_id)
    if ((others ?? 0) === 0) {
      const { data: au } = await g.db.auth.admin.getUserById(m.user_id)
      const used = Boolean((au?.user as { last_sign_in_at?: string | null } | undefined)?.last_sign_in_at)
      if (used) await g.db.auth.admin.updateUserById(m.user_id, { ban_duration: '876000h' })
      else await g.db.auth.admin.deleteUser(m.user_id)
    }
  } else if (m.email) {
    // invited but never accepted: delete the unused login created for the invite so the address can be invited again
    const { data: list } = await g.db.auth.admin.listUsers({ perPage: 200 })
    const un = (list?.users ?? []).find((u: { email?: string | null; last_sign_in_at?: string | null }) => (u.email ?? '').toLowerCase() === m.email!.toLowerCase() && !u.last_sign_in_at)
    if (un) {
      const { count: elsewhere } = await g.db.from('org_members').select('id', { count: 'exact', head: true }).eq('email', m.email)
      if ((elsewhere ?? 0) === 0) await g.db.auth.admin.deleteUser((un as { id: string }).id)
    }
  }

  await logHub(g.db, { orgId: id, actorId: g.user.id, actorEmail: g.user.email, action: 'user.removed', summary: `Removed user ${m.email ?? 'user'} (${m.role})`, details: { member: mid } })
  return NextResponse.json({ success: true })
}
