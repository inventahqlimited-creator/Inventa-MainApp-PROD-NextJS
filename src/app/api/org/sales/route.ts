// src/app/api/org/sales/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pickSO, lineRow, costLineRow, nextSoNumber } from './shared'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: m } = await adminClient
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const body = await request.json()
  const lines: Record<string, unknown>[] = Array.isArray(body.lines) ? body.lines : []
  const costLines: Record<string, unknown>[] = Array.isArray(body.cost_lines) ? body.cost_lines : []
  if (lines.length === 0) return NextResponse.json({ error: 'Add at least one line item.' }, { status: 400 })

  const soData = pickSO(body)
  // New orders can only start as a Draft, a Quote (when quotes are switched on in Settings) or Open
  if (soData.status === 'Quote') {
    const { data: org } = await adminClient.from('organisations').select('quotes_enabled').eq('id', orgId).single()
    if (!(org as { quotes_enabled?: boolean | null } | null)?.quotes_enabled) {
      return NextResponse.json({ error: 'Quotes are switched off. Turn them on in Settings → Sales.' }, { status: 400 })
    }
    soData.status = 'Quote'
  } else {
    soData.status = soData.status === 'Draft' ? 'Draft' : 'Open'
  }

  // Number from Settings → Sales (prefix / digits / suffix / start); retry if someone took the same one
  let so: { id: string; so_number: string } | null = null
  for (let attempt = 0; attempt < 5 && !so; attempt++) {
    let soNumber: string
    try {
      soNumber = await nextSoNumber(adminClient, orgId)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
    const { data, error } = await adminClient
      .from('sales_orders')
      .insert({ ...soData, so_number: soNumber, org_id: orgId, created_by: user.id })
      .select('id, so_number')
      .single()
    if (error) {
      if (error.code === '23505') continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    so = data as { id: string; so_number: string }
  }
  if (!so) return NextResponse.json({ error: 'Could not assign an order number — please try again.' }, { status: 500 })

  const { error: linesError } = await adminClient
    .from('sales_order_lines')
    .insert(lines.map((l, i) => ({ ...lineRow(l, i), so_id: so!.id, org_id: orgId })))
  if (linesError) {
    await adminClient.from('sales_orders').delete().eq('id', so.id)
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  if (costLines.length > 0) {
    const { error: costError } = await adminClient
      .from('sales_order_cost_lines')
      .insert(costLines.map((l, i) => ({ ...costLineRow(l, i), so_id: so!.id, org_id: orgId })))
    if (costError) {
      await adminClient.from('sales_orders').delete().eq('id', so.id)
      return NextResponse.json({ error: costError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: so.id, so_number: so.so_number })
}
