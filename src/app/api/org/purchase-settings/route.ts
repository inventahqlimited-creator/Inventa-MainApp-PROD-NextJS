// src/app/api/org/purchase-settings/route.ts
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

const ALLOWED_KEYS = [
  'allow_over_receive',
  'landing_cost_method',
  'po_prefix',
  'po_suffix',
  'po_start',
  'po_digits',
  'po_default_payment_terms',
  'po_default_deliver_to',
]

export async function PATCH(req: Request) {
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { error } = await auth.adminClient
    .from('organisations')
    .update(updates)
    .eq('id', auth.orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
