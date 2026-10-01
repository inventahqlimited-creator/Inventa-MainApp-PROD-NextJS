// src/app/api/org/sales/packing-list/route.ts
// GET  /api/org/sales/packing-list?ids=a,b,c — everything needed to print a packing list for those orders.
// POST /api/org/sales/packing-list { ids, overrides } — the same, but with the carton / shipping details from the
//      Pack screen that haven't been saved yet, so the printout matches what's on screen.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { loadPackingListPayload } from '@/lib/packing-list/data'
import type { PackOverrides } from '@/lib/packing-list/types'

async function build(ids: string[], overrides?: PackOverrides) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clean = ids.map(s => String(s).trim()).filter(Boolean).slice(0, 200)
  if (clean.length === 0) return NextResponse.json({ error: 'No orders selected' }, { status: 400 })

  try {
    const payload = await loadPackingListPayload(db, (m as { org_id: string }).org_id, clean, overrides)
    if (payload.orders.length === 0) return NextResponse.json({ error: 'None of these orders has been picked yet, so there is nothing to put on a packing list.' }, { status: 404 })
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the packing list' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',')
  return build(ids)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; overrides?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  const overrides = body.overrides && typeof body.overrides === 'object' ? (body.overrides as PackOverrides) : undefined
  return build(ids, overrides)
}
