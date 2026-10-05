// src/app/api/org/roles/[id]/route.ts
// PATCH — save a custom role's permissions. DELETE — remove it (not while anyone still has it). Needs "Manage roles and permissions".
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { closeSet } from '@/lib/permissions'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const g = await requirePerm('manage_roles')
  if ('res' in g) return g.res
  const { id } = await params
  const { permissions } = await req.json().catch(() => ({}))
  if (!permissions || typeof permissions !== 'object') return NextResponse.json({ error: 'Permissions are required' }, { status: 400 })

  const { data, error } = await g.access.db
    .from('org_roles')
    .update({ permissions: closeSet(permissions), updated_at: new Date().toISOString() })
    .eq('id', id).eq('org_id', g.access.orgId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const g = await requirePerm('manage_roles')
  if ('res' in g) return g.res
  const { id } = await params

  const { count } = await g.access.db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', g.access.orgId).eq('custom_role_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `${count} ${count === 1 ? 'person has' : 'people have'} this role. Give them another role first, then delete it.` }, { status: 409 })
  }
  const { error } = await g.access.db.from('org_roles').delete().eq('id', id).eq('org_id', g.access.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
