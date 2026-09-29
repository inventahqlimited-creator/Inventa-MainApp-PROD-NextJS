// src/app/api/org/purchases/[id]/receive/route.ts
// Receives stock against a purchase order. All the work (stock on hand, on order,
// movements, costs, PO status) happens in one database transaction:
// public.receive_purchase_order(...)
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
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
  const lines = Array.isArray(body.lines) ? body.lines : []
  if (lines.length === 0) return NextResponse.json({ error: 'Nothing to receive.' }, { status: 400 })

  const who =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email ||
    'User'

  const { data, error } = await adminClient.rpc('receive_purchase_order', {
    p_po: id,
    p_org: orgId,
    p_lines: lines.map((l: Record<string, unknown>) => ({
      id: l.id,
      qty_to_receive: Number(l.qty_to_receive) || 0,
      batch_num: l.batch_num ?? null,
      expiry_date: l.expiry_date ?? null,
      serial_numbers: Array.isArray(l.serial_numbers) ? l.serial_numbers : null,
    })),
    p_user: who,
    p_notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    p_backorder: body.backorder === true,
    p_bin: typeof body.bin === 'string' && body.bin.trim() ? body.bin.trim() : null,
    p_date: typeof body.receive_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.receive_date) ? body.receive_date : null,
  })

  // Validation messages raised in the database (e.g. "only 3 left to receive") come back as error.message
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data as { new_status: string; backorder_id?: string; backorder_number?: string })
}
