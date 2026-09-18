// src/app/api/org/price-levels/route.ts
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

  let { data } = await auth.adminClient.from('price_levels').select('*').eq('org_id', auth.orgId).order('sort_order').order('created_at')

  // Seed defaults if none exist
  if (!data || data.length === 0) {
    const defaults = [
      { name: 'Retail', is_default: true, sort_order: 1 },
      { name: 'Wholesale', is_default: false, sort_order: 2 },
      { name: 'VIP', is_default: false, sort_order: 3 },
    ].map(d => ({ ...d, org_id: auth.orgId }))
    const { data: seeded } = await auth.adminClient.from('price_levels').insert(defaults).select()
    data = seeded
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, sort_order } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const { data, error } = await auth.adminClient.from('price_levels')
    .insert({ org_id: auth.orgId, name: name.trim(), is_default: false, sort_order: sort_order ?? 0 })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
