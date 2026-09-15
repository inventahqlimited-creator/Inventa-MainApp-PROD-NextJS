import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { data: m } = await adminClient.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').single()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const orgId = (m as { org_id: string }).org_id

  const [{ data: poLines }, { data: soLines }] = await Promise.all([
    adminClient
      .from('purchase_order_lines')
      .select('id, quantity_ordered, purchase_orders(po_number, order_date, status)')
      .eq('product_id', id)
      .eq('org_id', orgId),
    adminClient
      .from('sales_order_lines')
      .select('id, quantity, sales_orders(so_number, order_date, status)')
      .eq('product_id', id)
      .eq('org_id', orgId),
  ])

  const orders = [
    ...(poLines ?? []).map((l: Record<string, unknown>) => {
      const po = l.purchase_orders as Record<string, unknown>
      return { id: l.id, order_number: po?.po_number, order_type: 'Purchase', order_date: po?.order_date, status: po?.status, quantity: l.quantity_ordered }
    }),
    ...(soLines ?? []).map((l: Record<string, unknown>) => {
      const so = l.sales_orders as Record<string, unknown>
      return { id: l.id, order_number: so?.so_number, order_type: 'Sale', order_date: so?.order_date, status: so?.status, quantity: l.quantity }
    }),
  ]

  return NextResponse.json(orders)
}
