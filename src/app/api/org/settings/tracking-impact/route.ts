import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function getOrgId() {
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

// GET: return how many products with this tracking on also have stock (locked count)
export async function GET(request: NextRequest) {
  const orgId = await getOrgId()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = request.nextUrl.searchParams.get('key') as 'serial_tracking' | 'batch_tracking' | 'expiry_tracking' | null
  const validKeys = ['serial_tracking', 'batch_tracking', 'expiry_tracking']
  if (!key || !validKeys.includes(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  const adminClient = createAdminClient()

  // Get products with this tracking on
  const { data: trackedProducts } = await adminClient
    .from('products')
    .select('id')
    .eq('org_id', orgId)
    .eq(key, true)

  if (!trackedProducts || trackedProducts.length === 0) {
    return NextResponse.json({ lockedCount: 0 })
  }

  const productIds = trackedProducts.map((p: { id: string }) => p.id)

  // Count how many of those have stock > 0
  const { data: stockLevels } = await adminClient
    .from('stock_levels')
    .select('product_id, quantity')
    .eq('org_id', orgId)
    .in('product_id', productIds)
    .gt('quantity', 0)

  const lockedProductIds = new Set((stockLevels ?? []).map((s: { product_id: string }) => s.product_id))
  const lockedCount = lockedProductIds.size

  return NextResponse.json({ lockedCount })
}

// POST: turn off global setting + turn off product-level tracking for products with NO stock
export async function POST(request: NextRequest) {
  const orgId = await getOrgId()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key } = await request.json() as { key: 'serial_tracking' | 'batch_tracking' | 'expiry_tracking' }
  const validKeys = ['serial_tracking', 'batch_tracking', 'expiry_tracking']
  if (!key || !validKeys.includes(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  const adminClient = createAdminClient()

  // Get products with this tracking on
  const { data: trackedProducts } = await adminClient
    .from('products')
    .select('id')
    .eq('org_id', orgId)
    .eq(key, true)

  if (trackedProducts && trackedProducts.length > 0) {
    const productIds = trackedProducts.map((p: { id: string }) => p.id)

    // Find which have stock > 0 (locked — keep their tracking on)
    const { data: stockLevels } = await adminClient
      .from('stock_levels')
      .select('product_id')
      .eq('org_id', orgId)
      .in('product_id', productIds)
      .gt('quantity', 0)

    const lockedIds = new Set((stockLevels ?? []).map((s: { product_id: string }) => s.product_id))
    const unlockableIds = productIds.filter(id => !lockedIds.has(id))

    // Turn off product-level tracking for products with no stock
    if (unlockableIds.length > 0) {
      await adminClient
        .from('products')
        .update({ [key]: false })
        .in('id', unlockableIds)
        .eq('org_id', orgId)
    }
  }

  // Turn off global setting
  await adminClient
    .from('organisations')
    .update({ [key]: false })
    .eq('id', orgId)

  return NextResponse.json({ ok: true })
}
