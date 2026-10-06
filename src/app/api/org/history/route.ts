// src/app/api/org/history/route.ts
// GET ?type=sales|purchase|transfer&id=<order id> — every Audit Log entry for one order: created, edited, picked, packed,
// received, closed, cancelled, and posted to Xero. Needs the "View Order History" permission for that kind of order.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAccess, can, denyResponse } from '@/lib/auth/access'
import type { PermKey } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const KINDS = {
  sales: { table: 'sales_orders', numberCol: 'so_number', lineType: 'sales_order_lines' },
  purchase: { table: 'purchase_orders', numberCol: 'po_number', lineType: 'purchase_order_lines' },
  transfer: { table: 'transfer_orders', numberCol: 'tr_number', lineType: 'transfer_order_lines' },
} as const

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const kind = KINDS[(sp.get('type') ?? '') as keyof typeof KINDS]
  const histPerm: Record<string, PermKey> = { sales: 'view_sales_history', purchase: 'view_purchase_history', transfer: 'view_transfer_history' }
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(access, histPerm[sp.get('type') ?? ''] ?? 'view_audit_log')) return denyResponse()
  const id = sp.get('id') ?? ''
  if (!kind || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').limit(1).maybeSingle()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const orgId = (m as { org_id: string }).org_id

  const { data: order } = await db.from(kind.table).select(`id, ${kind.numberCol}`).eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  const number = (order as unknown as Record<string, string | null>)[kind.numberCol]

  // The order's own entries (created, edited, status changes, Xero) plus its line entries (picked, packed, received), which carry the order number.
  const select = 'id, created_at, category, action, ref, detail, user_name'
  const [own, lines] = await Promise.all([
    db.from('audit_log').select(select).eq('org_id', orgId).eq('entity_id', id).order('created_at', { ascending: false }).limit(300),
    number
      ? db.from('audit_log').select(select).eq('org_id', orgId).eq('entity_type', kind.lineType).eq('ref', number).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (own.error) return NextResponse.json({ error: 'Could not load the history.' }, { status: 500 })

  type Row = { id: string; created_at: string }
  const seen = new Set<string>()
  const events = ([...(own.data ?? []), ...(lines.data ?? [])] as Row[])
    .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  return NextResponse.json({ number, events })
}
