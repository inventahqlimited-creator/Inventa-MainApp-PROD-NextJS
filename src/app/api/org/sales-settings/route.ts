// src/app/api/org/sales-settings/route.ts
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: m.org_id, adminClient } : null
}

const ALLOWED_KEYS = [
  'fulfilment_mode',
  'auto_picking',
  'allow_over_picking',
  'picking_rule',
  'so_prefix',
  'so_suffix',
  'so_start',
  'so_digits',
  'default_carrier',
  'default_shipping_method',
  'so_default_payment_terms',
  'so_default_ship_from',
  'pick_list_settings',
  'packing_list_settings',
  'invoice_settings',
  'quotes_enabled',
]

export async function PATCH(req: Request) {
  const permGate = await requirePerm('manage_sales_settings')
  if ('res' in permGate) return permGate.res
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
