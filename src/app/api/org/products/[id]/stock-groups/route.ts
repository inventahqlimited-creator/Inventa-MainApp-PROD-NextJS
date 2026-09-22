import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (membership as { org_id: string }).org_id

  const { id: productId } = await params

  const { data, error } = await adminClient
    .from('stock_groups')
    .select('id, location_id, batch_number, serial_number, expiry_date, quantity')
    .eq('org_id', orgId)
    .eq('product_id', productId)
    .gt('quantity', 0)
    .order('location_id')
    .order('expiry_date', { nullsFirst: false })
    .order('batch_number', { nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
