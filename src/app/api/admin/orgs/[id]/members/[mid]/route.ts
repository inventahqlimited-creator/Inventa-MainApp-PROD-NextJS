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
