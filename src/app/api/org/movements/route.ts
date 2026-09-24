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

  // Search modes
  const productIds  = searchParams.getAll('product_id')   // one or more
  const serialNum   = searchParams.get('serial_number')
  const batchNum    = searchParams.get('batch_number')

  // Filters
  const dateFrom      = searchParams.get('date_from')
  const dateTo        = searchParams.get('date_to')
  const movementType  = searchParams.get('type')
  const locationId    = searchParams.get('location_id')

  if (productIds.length === 0 && !serialNum && !batchNum) {
    return NextResponse.json({ error: 'Provide at least one product_id, serial_number, or batch_number' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // --- Resolve serial / batch → product ids via stock_groups ---
  let resolvedProductIds: string[] = [...productIds]

  // For serial/batch we also want to know which groups matched
  // so we can return the serial/batch metadata alongside movements
  type GroupInfo = { product_id: string; serial_number: string | null; batch_number: string | null; expiry_date: string | null }
  let groupInfoByProductId = new Map<string, GroupInfo[]>()

  if (serialNum || batchNum) {
    let groupQuery = adminClient
      .from('stock_groups')
      .select('id, product_id, serial_number, batch_number, expiry_date')
      .eq('org_id', orgId)

    if (serialNum) groupQuery = groupQuery.ilike('serial_number', `%${serialNum}%`)
    if (batchNum)  groupQuery = groupQuery.ilike('batch_number', `%${batchNum}%`)

    const { data: groups } = await groupQuery.limit(200)
    if (groups && groups.length > 0) {
      for (const g of groups) {
        resolvedProductIds.push(g.product_id)
        const existing = groupInfoByProductId.get(g.product_id) ?? []
        existing.push(g)
        groupInfoByProductId.set(g.product_id, existing)
      }
    }
    // De-dupe
    resolvedProductIds = [...new Set(resolvedProductIds)]
  }

  if (resolvedProductIds.length === 0) {
    return NextResponse.json({ movements: [], products: [] })
  }

  // --- Fetch movements ---
  let query = adminClient
    .from('stock_movements')
    .select('*')
    .eq('org_id', orgId)
    .in('product_id', resolvedProductIds)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (dateFrom)      query = query.gte('created_at', dateFrom)
  if (dateTo)        query = query.lte('created_at', dateTo + 'T23:59:59')
  if (movementType)  query = query.eq('movement_type', movementType)
  if (locationId)    query = query.eq('location_id', locationId)

  const { data: movements, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!movements || movements.length === 0) {
    return NextResponse.json({ movements: [], products: [] })
  }

  // --- Fetch product info ---
  const { data: products } = await adminClient
    .from('products')
    .select('id, name, sku')
    .in('id', resolvedProductIds)

  const productMap = new Map<string, { name: string; sku: string | null }>()
  for (const p of products ?? []) productMap.set(p.id, { name: p.name, sku: p.sku })

  // --- Fetch location info ---
  const locationIds = [...new Set(movements.map((m: { location_id: string | null }) => m.location_id).filter(Boolean))] as string[]
  const locationMap = new Map<string, string>()
  if (locationIds.length > 0) {
    const { data: locs } = await adminClient
      .from('locations')
      .select('id, name')
      .in('id', locationIds)
    for (const l of locs ?? []) locationMap.set(l.id, l.name)
  }

  // --- Fetch reference numbers (adj_number etc.) ---
  // Collect reference_ids by type so we can look up human-readable numbers
  const referenceMap = new Map<string, string>() // reference_id → human number
  const adjIds = [...new Set(
    movements
      .filter((m: { reference_type: string | null; reference_id: string | null }) => m.reference_type === 'adjustment_order' && m.reference_id)
      .map((m: { reference_id: string | null }) => m.reference_id as string)
  )]
  if (adjIds.length > 0) {
    const { data: adjs } = await adminClient
      .from('adjustment_orders')
      .select('id, adj_number')
      .in('id', adjIds)
    for (const a of adjs ?? []) {
      if (a.adj_number) referenceMap.set(a.id, a.adj_number)
    }
  }
  // Add more reference types here as needed (purchase_orders, sale_orders, etc.)

  // --- Enrich movements ---
  const enriched = movements.map((m: {
    id: string
    created_at: string
    product_id: string
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
  }) => {
    const prod = productMap.get(m.product_id)
    // Find matching group info for this product (for serial/batch context)
    const groups = groupInfoByProductId.get(m.product_id) ?? []
    const firstGroup = groups[0]
    return {
      ...m,
      product_name:      prod?.name ?? null,
      product_sku:       prod?.sku  ?? null,
      location_name:     m.location_id ? (locationMap.get(m.location_id) ?? null) : null,
      serial_number:     firstGroup?.serial_number ?? null,
      batch_number:      firstGroup?.batch_number  ?? null,
      expiry_date:       firstGroup?.expiry_date   ?? null,
      reference_number:  m.reference_id ? (referenceMap.get(m.reference_id) ?? null) : null,
      bin_id:            (m as { bin_id?: string | null }).bin_id ?? null,
    }
  })

  // Return matched product list too (for display in header)
  const matchedProducts = resolvedProductIds
    .map(id => ({ id, ...(productMap.get(id) ?? { name: id, sku: null }) }))
    .filter(p => p.name !== p.id)

  return NextResponse.json({ movements: enriched, products: matchedProducts })
}
