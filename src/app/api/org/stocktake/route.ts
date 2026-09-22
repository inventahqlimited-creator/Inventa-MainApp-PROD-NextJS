// src/app/api/org/stocktake/route.ts
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

// GET — download stock tick CSV
export async function GET(_request: Request) {
  const orgId = await getOrgId()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  const [{ data: products }, { data: stockGroups }, { data: stockLevels }, { data: locations }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, name, sku, sell_uom, track_stock, serial_tracking, batch_tracking, expiry_tracking')
      .eq('org_id', orgId)
      .order('name'),
    adminClient
      .from('stock_groups')
      .select('id, product_id, location_id, batch_number, serial_number, expiry_date, quantity')
      .eq('org_id', orgId)
      .gt('quantity', 0),
    adminClient
      .from('stock_levels')
      .select('product_id, location_id, quantity')
      .eq('org_id', orgId),
    adminClient
      .from('locations')
      .select('id, name')
      .eq('org_id', orgId),
  ])

  const locationMap = new Map((locations ?? []).map((l: { id: string; name: string }) => [l.id, l.name]))

  const headers = ['Product Name', 'SKU', 'Location', 'Quantity', 'Batch Number', 'Serial Number', 'Expiry Date']

  const rows: string[][] = []

  for (const p of (products ?? []) as {
    id: string; name: string; sku: string | null; sell_uom: string | null;
    track_stock: boolean | null; serial_tracking: boolean | null; batch_tracking: boolean | null; expiry_tracking: boolean | null
  }[]) {
    const isTracked = p.serial_tracking || p.batch_tracking || p.expiry_tracking
    const groups = (stockGroups ?? []).filter((g: { product_id: string }) => g.product_id === p.id) as {
      id: string; product_id: string; location_id: string | null; batch_number: string | null;
      serial_number: string | null; expiry_date: string | null; quantity: number
    }[]

    if (isTracked && groups.length > 0) {
      // One row per stock group
      for (const g of groups) {
        rows.push([
          p.name,
          p.sku ?? '',
          g.location_id ? (locationMap.get(g.location_id) ?? '') : '',
          String(g.quantity),
          g.batch_number ?? '',
          g.serial_number ?? '',
          g.expiry_date ?? '',
        ])
      }
    } else {
      // Consolidated row — sum across all locations from stock_levels
      const levels = (stockLevels ?? []).filter((sl: { product_id: string }) => sl.product_id === p.id) as {
        product_id: string; location_id: string; quantity: number
      }[]
      if (levels.length > 0) {
        // One row per location for untracked products
        for (const sl of levels) {
          rows.push([
            p.name,
            p.sku ?? '',
            locationMap.get(sl.location_id) ?? '',
            String(sl.quantity),
            '',
            '',
            '',
          ])
        }
      } else {
        // No stock at all — still include product with 0 qty
        rows.push([p.name, p.sku ?? '', '', '0', '', '', ''])
      }
    }
  }

  const escape = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(escape).join(',')),
  ].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="stocktake-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

// POST — import stock tick CSV and apply quantities
export async function POST(request: Request) {
  const orgId = await getOrgId()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { rows: {
    product_id: string
    product_name: string
    sku: string
    location_id: string | null
    quantity: number
    batch_number: string | null
    serial_number: string | null
    expiry_date: string | null
    serial_tracking: boolean
    batch_tracking: boolean
    expiry_tracking: boolean
  }[] }

  if (!body.rows || body.rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Apply each row: upsert stock_groups and update stock_levels
  for (const row of body.rows) {
    const isTracked = row.serial_tracking || row.batch_tracking || row.expiry_tracking

    if (isTracked) {
      // Find existing stock group matching this lot
      let query = adminClient
        .from('stock_groups')
        .select('id')
        .eq('org_id', orgId)
        .eq('product_id', row.product_id)

      if (row.location_id) query = query.eq('location_id', row.location_id)
      else query = query.is('location_id', null)

      if (row.batch_number) query = query.eq('batch_number', row.batch_number)
      else query = query.is('batch_number', null)

      if (row.serial_number) query = query.eq('serial_number', row.serial_number)
      else query = query.is('serial_number', null)

      if (row.expiry_date) query = query.eq('expiry_date', row.expiry_date)
      else query = query.is('expiry_date', null)

      const { data: existing } = await query.maybeSingle()

      if (existing) {
        await adminClient
          .from('stock_groups')
          .update({ quantity: row.quantity })
          .eq('id', existing.id)
      } else {
        await adminClient
          .from('stock_groups')
          .insert({
            org_id: orgId,
            product_id: row.product_id,
            location_id: row.location_id,
            batch_number: row.batch_number,
            serial_number: row.serial_number,
            expiry_date: row.expiry_date,
            quantity: row.quantity,
          })
      }
    }

    // Always update stock_levels
    if (row.location_id) {
      await adminClient
        .from('stock_levels')
        .upsert({
          org_id: orgId,
          product_id: row.product_id,
          location_id: row.location_id,
          quantity: row.quantity,
        }, { onConflict: 'org_id,product_id,location_id' })
    }
  }

  // For tracked products, recalculate stock_levels from sum of stock_groups
  const trackedProductIds = [...new Set(
    body.rows.filter(r => r.serial_tracking || r.batch_tracking || r.expiry_tracking).map(r => r.product_id)
  )]

  for (const productId of trackedProductIds) {
    const locationIds = [...new Set(body.rows.filter(r => r.product_id === productId && r.location_id).map(r => r.location_id as string))]
    for (const locationId of locationIds) {
      const { data: groups } = await adminClient
        .from('stock_groups')
        .select('quantity')
        .eq('org_id', orgId)
        .eq('product_id', productId)
        .eq('location_id', locationId)
      const total = (groups ?? []).reduce((sum: number, g: { quantity: number }) => sum + (g.quantity ?? 0), 0)
      await adminClient
        .from('stock_levels')
        .upsert({ org_id: orgId, product_id: productId, location_id: locationId, quantity: total }, { onConflict: 'org_id,product_id,location_id' })
    }
  }

  return NextResponse.json({ ok: true, count: body.rows.length })
}
