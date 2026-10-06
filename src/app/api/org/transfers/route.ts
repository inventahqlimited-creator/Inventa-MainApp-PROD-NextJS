// src/app/api/org/transfers/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { pickTR, lineRow, nextTrNumber, validateTransfer } from './shared'
import { requirePerm } from '@/lib/auth/access'

export async function POST(request: Request) {
  const permGate = await requirePerm('create_transfers')
  if ('res' in permGate) return permGate.res
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
  if (lines.length === 0) return NextResponse.json({ error: 'Add at least one product.' }, { status: 400 })
  if (lines.some(l => !(Number(l.quantity) > 0))) return NextResponse.json({ error: 'Every line needs a quantity above zero.' }, { status: 400 })

  const trData = pickTR(body)
  if (!trData.from_location_id || !trData.to_location_id) return NextResponse.json({ error: 'Choose both a From and a To location.' }, { status: 400 })
  // New transfers start as a Draft or Open
  trData.status = trData.status === 'Draft' ? 'Draft' : 'Open'

  const bad = await validateTransfer(adminClient, orgId, trData.from_location_id as string, trData.to_location_id as string, lines)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  // Number from Settings → Transfers; retry if someone took the same one
  let tr: { id: string; tr_number: string } | null = null
  for (let attempt = 0; attempt < 5 && !tr; attempt++) {
    let trNumber: string
    try {
      trNumber = await nextTrNumber(adminClient, orgId)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
    const { data, error } = await adminClient
      .from('transfer_orders')
      .insert({ ...trData, tr_number: trNumber, org_id: orgId })
      .select('id, tr_number')
      .single()
    if (error) {
      if (error.code === '23505') continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    tr = data as { id: string; tr_number: string }
  }
  if (!tr) return NextResponse.json({ error: 'Could not assign a transfer number — please try again.' }, { status: 500 })

  const { error: linesError } = await adminClient
    .from('transfer_order_lines')
    .insert(lines.map((l, i) => ({ ...lineRow(l, i), tr_id: tr!.id, org_id: orgId })))
  if (linesError) {
    await adminClient.from('transfer_orders').delete().eq('id', tr.id)
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  return NextResponse.json({ id: tr.id, tr_number: tr.tr_number })
}
