import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pick, badForeignKey, PRODUCT_FIELDS, PRODUCT_LINKS } from '@/lib/api/sanitize'
import { requirePerm } from '@/lib/auth/access'

export async function POST(request: Request) {
  const permGate = await requirePerm('create_products')
  if ('res' in permGate) return permGate.res
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clean = pick(await request.json().catch(() => null), PRODUCT_FIELDS)
  if (!clean) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const badFk = await badForeignKey(adminClient, (m as { org_id: string }).org_id, clean, PRODUCT_LINKS)
  if (badFk) return NextResponse.json({ error: `Invalid ${badFk}` }, { status: 400 })
  const { data, error } = await adminClient
    .from('products')
    .insert({ ...clean, org_id: (m as { org_id: string }).org_id })
    .select('id')
    .single()

  if (error) { console.error('products insert failed', error.message); return NextResponse.json({ error: 'Could not save the product' }, { status: 500 }) }
  return NextResponse.json({ id: (data as { id: string }).id })
}
