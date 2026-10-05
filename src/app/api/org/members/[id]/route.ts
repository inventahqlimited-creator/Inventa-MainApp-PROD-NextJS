// src/app/api/org/members/[id]/route.ts
// One team member — read, edit (details, role, active/inactive, pending email) and remove.
// Needs "Invite, edit and remove users" (reading needs "View users"). Only an Administrator can touch another Administrator or make one.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAccess, can } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }
const ROLES = ['admin', 'manager', 'staff', 'read_only']

type Member = {
  id: string; user_id: string | null; org_id: string; role: string; custom_role_id: string | null; invite_status: string
  first_name: string | null; last_name: string | null; email: string | null
  phone: string | null; designation: string | null; avatar_url: string | null
}

async function getCaller(write = true) {
  const a = await getAccess()
  if (!a) return null
  if (!(write ? can(a, 'manage_users') : can(a, 'view_users'))) return null
  return { user: { id: a.userId }, db: a.db as ReturnType<typeof createAdminClient>, orgId: a.orgId, isAdmin: a.isAdmin }
}

async function getTarget(db: ReturnType<typeof createAdminClient>, id: string, orgId: string) {
  const { data } = await db.from('org_members')
    .select('id, user_id, org_id, role, custom_role_id, invite_status, first_name, last_name, email, phone, designation, avatar_url')
    .eq('id', id).eq('org_id', orgId).maybeSingle()
  return data as Member | null
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null)

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const c = await getCaller(false)
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const t = await getTarget(c.db, id, c.orgId)
  if (!t) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  let email = t.email ?? ''
  if (!email && t.user_id) {
    const { data } = await c.db.auth.admin.getUserById(t.user_id)
    email = data?.user?.email ?? ''
  }
  return NextResponse.json({ ...t, email })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const c = await getCaller()
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const t = await getTarget(c.db, id, c.orgId)
  if (!t) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (t.role === 'admin' && !c.isAdmin) return NextResponse.json({ error: 'Only an Administrator can change another Administrator.' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const isSelf = t.user_id === c.user.id
  const update: Record<string, string | null> = {}

  // details (same fields as the Profile popup)
  const first = str(body.first_name, 80)
  if (first !== null) {
    if (first === '') return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    update.first_name = first
  }
  const last = str(body.last_name, 80); if (last !== null) update.last_name = last || null
  const phone = str(body.phone, 40); if (phone !== null) update.phone = phone || null
  const desig = str(body.designation, 80); if (desig !== null) update.designation = desig || null

  // role
  const wantCustom = body.custom_role_id === undefined ? undefined : (typeof body.custom_role_id === 'string' && body.custom_role_id ? body.custom_role_id : null)
  const roleChanging = (body.role !== undefined && body.role !== t.role) || (wantCustom !== undefined && wantCustom !== t.custom_role_id)
  if (roleChanging) {
    if (isSelf) return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
    const newRole = String(body.role ?? t.role)
    if (!ROLES.includes(newRole)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    if (newRole === 'admin' && !c.isAdmin) return NextResponse.json({ error: 'Only an Administrator can make someone an Administrator.' }, { status: 403 })
    if (wantCustom) {
      if (newRole === 'admin') return NextResponse.json({ error: 'An Administrator can’t have a custom role.' }, { status: 400 })
      const { data: cr } = await c.db.from('org_roles').select('id').eq('id', wantCustom).eq('org_id', c.orgId).maybeSingle()
      if (!cr) return NextResponse.json({ error: 'That role no longer exists.' }, { status: 400 })
    }
    update.role = newRole
    // a fixed role clears any custom role; a custom role sits on top of "staff"
    update.custom_role_id = newRole === 'admin' ? null : wantCustom === undefined ? t.custom_role_id : wantCustom
  }

  // active / inactive
  let banChange: 'ban' | 'unban' | null = null
  if (body.status !== undefined) {
    const want = String(body.status)
    if (!['active', 'inactive'].includes(want)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    if (isSelf) return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 })
    if (t.invite_status === 'pending') return NextResponse.json({ error: 'This user has not accepted their invite yet' }, { status: 400 })
    if (want === 'inactive' && t.invite_status !== 'inactive') { update.invite_status = 'inactive'; banChange = 'ban' }
    if (want === 'active' && t.invite_status === 'inactive') { update.invite_status = 'accepted'; banChange = 'unban' }
  }

  // email — only while the invite is still pending; the invite goes to the new address
  let reinvite: string | null = null
  const newEmail = str(body.email, 200)?.toLowerCase()
  if (newEmail !== undefined && newEmail !== null && newEmail !== (t.email ?? '').toLowerCase()) {
    if (t.invite_status !== 'pending') return NextResponse.json({ error: 'Email can only be changed while the invite is pending' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    const { data: dup } = await c.db.from('org_members').select('id').eq('org_id', c.orgId).ilike('email', newEmail).neq('id', id).maybeSingle()
    if (dup) return NextResponse.json({ error: 'That email is already on your team' }, { status: 409 })
    update.email = newEmail
    reinvite = newEmail
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ success: true })

  const { error } = await c.db.from('org_members').update(update).eq('id', id).eq('org_id', c.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (banChange && t.user_id) {
    await c.db.auth.admin.updateUserById(t.user_id, { ban_duration: banChange === 'ban' ? '876000h' : 'none' })
  }

  if (reinvite) {
    // drop the unused account created for the old address, then invite the new one
    if (t.email) {
      const { data: list } = await c.db.auth.admin.listUsers({ perPage: 200 })
      const old = (list?.users ?? []).find((u: { email?: string | null; last_sign_in_at?: string | null }) => (u.email ?? '').toLowerCase() === t.email!.toLowerCase() && !u.last_sign_in_at)
      if (old) await c.db.auth.admin.deleteUser((old as { id: string }).id)
    }
    const { error: invErr } = await c.db.auth.admin.inviteUserByEmail(reinvite, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: { org_id: c.orgId, role: update.role ?? t.role },
    })
    if (invErr) return NextResponse.json({ error: `Saved, but the invite email failed: ${invErr.message}` }, { status: 500 })
    return NextResponse.json({ success: true, invited: reinvite })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const c = await getCaller()
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const t = await getTarget(c.db, id, c.orgId)
  if (!t) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (t.user_id === c.user.id) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
  if (t.role === 'admin' && !c.isAdmin) return NextResponse.json({ error: 'Only an Administrator can remove another Administrator.' }, { status: 403 })

  const { error } = await c.db.from('org_members').delete().eq('id', id).eq('org_id', c.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (t.user_id) await c.db.auth.admin.updateUserById(t.user_id, { ban_duration: '876000h' })
  return NextResponse.json({ success: true })
}
