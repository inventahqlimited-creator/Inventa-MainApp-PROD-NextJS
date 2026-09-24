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
  const url = new URL(_request.url)
  const locationId = url.searchParams.get('location_id')

  let query = adminClient
    .from('stock_groups')
    .select('id, location_id, batch_number, serial_number, expiry_date, bin_id, quantity')
    .eq('org_id', orgId)
    .eq('product_id', productId)
    .gt('quantity', 0)

  if (locationId) query = query.eq('location_id', locationId)

  const { data, error } = await query
    .order('location_id')
    .order('expiry_date', { nullsFirst: false })
    .order('batch_number', { nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const groups = data ?? []

  // Resolve bin names
  const binIds = [...new Set(groups.map((g: { bin_id: string | null }) => g.bin_id).filter(Boolean))] as string[]
  const binMap = new Map<string, string>()
  if (binIds.length > 0) {
    const { data: bins } = await adminClient
      .from('bins')
      .select('id, name')
      .in('id', binIds)
    for (const b of bins ?? []) binMap.set(b.id, b.name)
  }

  const enriched = groups.map((g: { bin_id: string | null; [key: string]: unknown }) => ({
    ...g,
    bin_name: g.bin_id ? (binMap.get(g.bin_id) ?? null) : null,
  }))

  return NextResponse.json(enriched)
}
