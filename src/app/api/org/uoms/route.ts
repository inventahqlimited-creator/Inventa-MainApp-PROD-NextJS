// src/app/api/org/uoms/route.ts
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: m.org_id, adminClient } : null
}

export async function GET() {
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { data } = await auth.adminClient.from('uoms').select('*').eq('org_id', auth.orgId).order('sort_order').order('created_at')

  // Seed defaults if none exist
  if (!data || data.length === 0) {
    const defaults = [
      { name: 'Each', abbr: 'ea', sort_order: 1 },
      { name: 'Box', abbr: 'w', sort_order: 2 },
      { name: 'Carton', abbr: 'ctn', sort_order: 3 },
      { name: 'Pallet', abbr: 'plt', sort_order: 4 },
      { name: 'kg', abbr: 'kg', sort_order: 5 },
      { name: 'Litre', abbr: 'L', sort_order: 6 },
    ].map(d => ({ ...d, org_id: auth.orgId }))
    const { data: seeded } = await auth.adminClient.from('uoms').insert(defaults).select()
    data = seeded
  }

  // Check which are in use
  const { data: usedIds } = await auth.adminClient
    .from('products')
    .select('uom_id')
    .eq('org_id', auth.orgId)
    .not('uom_id', 'is', null)

  const inUseSet = new Set((usedIds ?? []).map((r: Record<string, unknown>) => r.uom_id))
  return NextResponse.json((data ?? []).map((u: Record<string, unknown>) => ({ ...u, in_use: inUseSet.has(u.id) })))
}

export async function POST(req: Request) {
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, abbr, sort_order } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const { data, error } = await auth.adminClient.from('uoms')
    .insert({ org_id: auth.orgId, name: name.trim(), abbr: (abbr ?? '').trim(), sort_order: sort_order ?? 0 })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, in_use: false })
}
