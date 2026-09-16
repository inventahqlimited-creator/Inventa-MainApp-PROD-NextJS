import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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
  const { lines, ...trData } = body

  const { data: tr, error: trError } = await adminClient
    .from('transfer_orders')
    .insert({ ...trData, org_id: orgId })
    .select('id, tr_number')
    .single()

  if (trError) return NextResponse.json({ error: trError.message }, { status: 500 })
  const trId = (tr as { id: string }).id

  if (lines && lines.length > 0) {
    const lineRows = lines.map((l: Record<string, unknown>) => ({
      ...l,
      tr_id: trId,
      org_id: orgId,
    }))
    const { error: linesError } = await adminClient.from('transfer_order_lines').insert(lineRows)
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  return NextResponse.json({ id: trId })
}
