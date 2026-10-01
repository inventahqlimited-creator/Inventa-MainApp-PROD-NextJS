// src/app/api/org/profile/route.ts
// The signed-in user's own profile (stored on their org_members row).
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', manager: 'Manager', staff: 'Staff', read_only: 'Read Only' }

async function getMember() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: m } = await db
    .from('org_members')
    .select('id, org_id, role, custom_role_id, first_name, last_name, phone, designation, avatar_url')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!m) return null
  return { user, db, m: m as { id: string; org_id: string; role: string; custom_role_id: string | null; first_name: string | null; last_name: string | null; phone: string | null; designation: string | null; avatar_url: string | null } }
}

export async function GET() {
  const a = await getMember()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { m, user, db } = a
  let accessLabel = ROLE_LABEL[m.role] ?? 'Staff'
  if (m.custom_role_id) {
    const { data: r } = await db.from('org_roles').select('name').eq('id', m.custom_role_id).eq('org_id', m.org_id).single()
    if (r?.name) accessLabel = `${accessLabel} · ${r.name}`
  }
  return NextResponse.json({
    first_name: m.first_name ?? '', last_name: m.last_name ?? '', phone: m.phone ?? '',
    designation: m.designation ?? '', avatar_url: m.avatar_url ?? '', email: user.email ?? '', access: accessLabel,
  })
}

export async function PATCH(req: Request) {
  const a = await getMember()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null)

  const first_name = str(body.first_name, 80)
  const last_name = str(body.last_name, 80)
  if (first_name !== null && first_name === '') return NextResponse.json({ error: 'First name is required' }, { status: 400 })

  const update: Record<string, string | null> = {}
  if (first_name !== null) update.first_name = first_name
  if (last_name !== null) update.last_name = last_name || null
  const phone = str(body.phone, 40);        if (phone !== null) update.phone = phone || null
  const designation = str(body.designation, 80); if (designation !== null) update.designation = designation || null

  // only role / org / email are off limits — everything above belongs to the user
  const { error } = await a.db.from('org_members').update(update).eq('id', a.m.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
