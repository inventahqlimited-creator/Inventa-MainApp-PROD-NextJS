// src/app/api/org/products/[id]/prices/route.ts
// Price-level prices for one product, with quantity breaks: [{ level_id, price, break_qty }].
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requirePerm } from '@/lib/auth/access'

type Params = { params: Promise<{ id: string }> }

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  return m ? { orgId: (m as { org_id: string }).org_id, adminClient } : null
}

export async function GET(_req: Request, { params }: Params) {
  const permGate = await requirePerm('view_pricing')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await auth.adminClient
    .from('product_prices')
    .select('level_id, price, break_qty')
    .eq('org_id', auth.orgId)
    .eq('product_id', id)
    .order('break_qty')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Body: { rows: [{ level_id, price, break_qty }], mode?: 'all' | 'levels' }
//  'all'    (default) — the rows become the product's complete set of price-level prices
//  'levels' — only the levels that appear in `rows` are replaced (used by CSV import)
export async function POST(req: Request, { params }: Params) {
  const permGate = await requirePerm('edit_products')
  if ('res' in permGate) return permGate.res
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = auth.adminClient

  const { data: prod } = await db.from('products').select('id').eq('id', id).eq('org_id', auth.orgId).single()
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const input = (Array.isArray(body.rows) ? body.rows : []) as { level_id?: string; price?: number | string; break_qty?: number | string }[]

  // keep valid rows only, one per level + break quantity (last one wins)
  const dedupe = new Map<string, { org_id: string; product_id: string; level_id: string; price: number; break_qty: number }>()
  for (const r of input) {
    const price = Number(r.price)
    const brk = Math.max(Math.floor(Number(r.break_qty) || 1), 1)
    if (!r.level_id || !Number.isFinite(price) || price <= 0) continue
    dedupe.set(`${r.level_id}|${brk}`, { org_id: auth.orgId, product_id: id, level_id: r.level_id, price, break_qty: brk })
  }
  const rows = [...dedupe.values()]

  if (body.mode === 'levels') {
    const levels = [...new Set(input.map(r => r.level_id).filter(Boolean) as string[])]
    if (levels.length) {
      const { error } = await db.from('product_prices').delete().eq('org_id', auth.orgId).eq('product_id', id).in('level_id', levels)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await db.from('product_prices').delete().eq('org_id', auth.orgId).eq('product_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (rows.length) {
    const { error } = await db.from('product_prices').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, saved: rows.length })
}
