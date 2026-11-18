// src/lib/related-docs.ts
// Every document linked to a sales order, purchase order or credit note, for the "Related Orders" card:
//   • SO ↔ PO when one was created from the other (sales_orders.source_po_id / purchase_orders.source_so_id)
//   • SO → its credit notes (credit_notes.so_id)
//   • PO ↔ its backorders (backorder_from_number / backorder_to_number)
import type { SupabaseClient } from '@supabase/supabase-js'

export type RelatedDoc = {
  kind: 'sales' | 'purchase' | 'return'
  id: string
  number: string
  relation: string
  date: string | null
  status: string
  total: number | null
  currency: string | null
}

type Db = SupabaseClient
type SoRow = { id: string; so_number: string | null; order_date: string | null; status: string; total_amount: number | null; currency: string | null }
type PoRow = { id: string; po_number: string | null; order_date: string | null; status: string; total_amount: number | null; currency: string | null }
type CnRow = { id: string; cn_number: string | null; return_date: string | null; status: string; total_amount: number | null; currency: string | null }

const SO_COLS = 'id, so_number, order_date, status, total_amount, currency'
const PO_COLS = 'id, po_number, order_date, status, total_amount, currency'
const CN_COLS = 'id, cn_number, return_date, status, total_amount, currency'

const so = (r: SoRow, relation: string): RelatedDoc => ({ kind: 'sales', id: r.id, number: r.so_number ?? 'Sales order', relation, date: r.order_date, status: r.status, total: r.total_amount, currency: r.currency })
const po = (r: PoRow, relation: string): RelatedDoc => ({ kind: 'purchase', id: r.id, number: r.po_number ?? 'Purchase order', relation, date: r.order_date, status: r.status, total: r.total_amount, currency: r.currency })
const cn = (r: CnRow, relation: string): RelatedDoc => ({ kind: 'return', id: r.id, number: r.cn_number ?? 'Credit note', relation, date: r.return_date, status: r.status, total: r.total_amount, currency: r.currency })

export async function relatedForSalesOrder(db: Db, orgId: string, soId: string): Promise<RelatedDoc[]> {
  const { data: me } = await db.from('sales_orders').select('source_po_id').eq('org_id', orgId).eq('id', soId).maybeSingle()
  const sourcePo = (me as { source_po_id: string | null } | null)?.source_po_id ?? null
  const [{ data: from }, { data: made }, { data: cns }] = await Promise.all([
    sourcePo ? db.from('purchase_orders').select(PO_COLS).eq('org_id', orgId).eq('id', sourcePo).maybeSingle() : Promise.resolve({ data: null }),
    db.from('purchase_orders').select(PO_COLS).eq('org_id', orgId).eq('source_so_id', soId).order('created_at'),
    db.from('credit_notes').select(CN_COLS).eq('org_id', orgId).eq('so_id', soId).order('created_at'),
  ])
  return [
    ...(from ? [po(from as PoRow, 'Created from')] : []),
    ...((made ?? []) as PoRow[]).filter(r => r.id !== sourcePo).map(r => po(r, 'Created from this order')),
    ...((cns ?? []) as CnRow[]).map(r => cn(r, 'Return')),
  ]
}

export async function relatedForPurchaseOrder(db: Db, orgId: string, poId: string): Promise<RelatedDoc[]> {
  const { data: me } = await db.from('purchase_orders').select('source_so_id, backorder_from_number, backorder_to_number').eq('org_id', orgId).eq('id', poId).maybeSingle()
  const m = (me ?? {}) as { source_so_id?: string | null; backorder_from_number?: string | null; backorder_to_number?: string | null }
  const [{ data: from }, { data: made }, { data: parent }, { data: child }] = await Promise.all([
    m.source_so_id ? db.from('sales_orders').select(SO_COLS).eq('org_id', orgId).eq('id', m.source_so_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('sales_orders').select(SO_COLS).eq('org_id', orgId).eq('source_po_id', poId).order('created_at'),
    m.backorder_from_number ? db.from('purchase_orders').select(PO_COLS).eq('org_id', orgId).eq('po_number', m.backorder_from_number).maybeSingle() : Promise.resolve({ data: null }),
    m.backorder_to_number ? db.from('purchase_orders').select(PO_COLS).eq('org_id', orgId).eq('po_number', m.backorder_to_number).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return [
    ...(from ? [so(from as SoRow, 'Created from')] : []),
    ...((made ?? []) as SoRow[]).filter(r => r.id !== m.source_so_id).map(r => so(r, 'Created from this order')),
    ...(parent ? [po(parent as PoRow, 'Backorder of')] : []),
    ...(child ? [po(child as PoRow, 'Backorder')] : []),
  ]
}

export async function relatedForCreditNote(db: Db, orgId: string, cnId: string): Promise<RelatedDoc[]> {
  const { data: me } = await db.from('credit_notes').select('so_id').eq('org_id', orgId).eq('id', cnId).maybeSingle()
  const soId = (me as { so_id: string | null } | null)?.so_id
  if (!soId) return []
  const [{ data: order }, { data: others }, { data: pos }] = await Promise.all([
    db.from('sales_orders').select(SO_COLS + ', source_po_id').eq('org_id', orgId).eq('id', soId).maybeSingle(),
    db.from('credit_notes').select(CN_COLS).eq('org_id', orgId).eq('so_id', soId).neq('id', cnId).order('created_at'),
    db.from('purchase_orders').select(PO_COLS).eq('org_id', orgId).eq('source_so_id', soId).order('created_at'),
  ])
  return [
    ...(order ? [so(order as unknown as SoRow, 'Returned against')] : []),
    ...((others ?? []) as CnRow[]).map(r => cn(r, 'Other return on this order')),
    ...((pos ?? []) as PoRow[]).map(r => po(r, 'Created from the sales order')),
  ]
}
