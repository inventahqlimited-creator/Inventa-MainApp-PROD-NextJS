// src/app/api/org/movements/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  return membership?.org_id ?? null
}

export async function GET(request: Request) {
  const orgId = await getOrgId()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const movementType = searchParams.get('type')
  const locationId = searchParams.get('location_id')

  if (!productId) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Fetch movements
  let query = adminClient
    .from('stock_movements')
    .select('*')
    .eq('org_id', orgId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
  if (movementType) query = query.eq('movement_type', movementType)
  if (locationId) query = query.eq('location_id', locationId)

  const { data: movements, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!movements || movements.length === 0) {
    return NextResponse.json({ movements: [] })
  }

  // Fetch product info
  const { data: product } = await adminClient
    .from('products')
    .select('id, name, sku')
    .eq('id', productId)
    .single()

  // Fetch all relevant locations
  const locationIds = [...new Set(movements.map((m: { location_id: string | null }) => m.location_id).filter(Boolean))] as string[]
  let locationMap = new Map<string, string>()
  if (locationIds.length > 0) {
    const { data: locations } = await adminClient
      .from('locations')
      .select('id, name')
      .in('id', locationIds)
    for (const l of locations ?? []) {
      locationMap.set(l.id, l.name)
    }
  }

  const enriched = movements.map((m: {
    id: string
    created_at: string
    movement_type: string
    qty: number
    unit_cost: number | null
    unit_price: number | null
    reference_id: string | null
    reference_type: string | null
    note: string | null
    created_by: string | null
    location_id: string | null
    org_id: string
    product_id: string
  }) => ({
    ...m,
    product_name: product?.name ?? null,
    product_sku: product?.sku ?? null,
    location_name: m.location_id ? (locationMap.get(m.location_id) ?? null) : null,
  }))

  return NextResponse.json({ movements: enriched })
}
