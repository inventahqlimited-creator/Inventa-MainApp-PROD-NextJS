import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cleanAdjustment, checkOwnership } from '@/lib/adjustments/validate'
import { requirePerm } from '@/lib/auth/access'

export async function POST(request: Request) {
  const permGate = await requirePerm('create_adjustments')
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

  const cleaned = cleanAdjustment(await request.json().catch(() => null))
  if ('error' in cleaned && cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { header, lines } = cleaned as { header: Record<string, unknown>; lines?: Record<string, unknown>[] }
  const ownErr = await checkOwnership(adminClient, orgId, header, lines)
  if (ownErr) return NextResponse.json({ error: ownErr }, { status: 400 })

  // New adjustments always start as a draft; completing one is a separate step.
  const { data: adj, error: adjError } = await adminClient
    .from('adjustment_orders')
    .insert({ ...header, status: 'Draft', created_by: user.id, org_id: orgId })
    .select('id')
    .single()

  if (adjError) { console.error('adjustment insert failed', adjError.message); return NextResponse.json({ error: 'Could not save the adjustment' }, { status: 500 }) }
  const adjId = (adj as { id: string }).id

  if (lines && lines.length > 0) {
    const lineRows = lines.map((l) => ({
      ...l,
      adj_id: adjId,
      org_id: orgId,
    }))
    const { error: linesError } = await adminClient.from('adjustment_order_lines').insert(lineRows)
    if (linesError) {
      console.error('adjustment lines insert failed', linesError.message)
      await adminClient.from('adjustment_orders').delete().eq('id', adjId).eq('org_id', orgId)
      return NextResponse.json({ error: 'Could not save the adjustment lines' }, { status: 500 })
    }
  }

  return NextResponse.json({ id: adjId })
}
