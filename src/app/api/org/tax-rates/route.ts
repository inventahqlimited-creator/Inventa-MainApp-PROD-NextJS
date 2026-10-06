import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pick, TAX_RATE_FIELDS } from '@/lib/api/sanitize'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const clean = pick(await request.json().catch(() => null), TAX_RATE_FIELDS)
  if (!clean) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const { data, error } = await adminClient.from('tax_rates').insert({ ...clean, org_id: (m as { org_id: string }).org_id }).select('id').single()
  if (error) { console.error('tax rate insert failed', error.message); return NextResponse.json({ error: 'Could not save the tax rate' }, { status: 500 }) }
  return NextResponse.json({ id: (data as { id: string }).id })
}
