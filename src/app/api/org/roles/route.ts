// src/app/api/org/roles/route.ts
// GET — the organisation's custom roles (anyone who can see users or manage roles).
// POST — create a custom role (needs "Manage roles and permissions").
import { NextResponse } from 'next/server'
import { requireAnyPerm, requirePerm } from '@/lib/auth/access'
import { closeSet, FIXED_ROLES, ROLE_LABELS } from '@/lib/permissions'

export async function GET() {
  const g = await requireAnyPerm('view_users', 'manage_roles', 'manage_users')
  if ('res' in g) return g.res
  const { data } = await g.access.db.from('org_roles').select('id, name, permissions').eq('org_id', g.access.orgId).order('created_at')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const g = await requirePerm('manage_roles')
  if ('res' in g) return g.res
  const { name, permissions } = await req.json().catch(() => ({}))
  const n = typeof name === 'string' ? name.trim().slice(0, 60) : ''
  if (!n) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (FIXED_ROLES.some(f => ROLE_LABELS[f].toLowerCase() === n.toLowerCase() || f === n.toLowerCase())) {
    return NextResponse.json({ error: 'That name is used by a standard role. Choose another.' }, { status: 409 })
  }
  const { data: dup } = await g.access.db.from('org_roles').select('id').eq('org_id', g.access.orgId).ilike('name', n).maybeSingle()
  if (dup) return NextResponse.json({ error: 'A role with this name already exists.' }, { status: 409 })

  const { data, error } = await g.access.db
    .from('org_roles')
    .insert({ org_id: g.access.orgId, name: n, permissions: closeSet(permissions) })
    .select('id, name, permissions')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
