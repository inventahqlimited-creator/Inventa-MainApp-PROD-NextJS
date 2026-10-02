// src/lib/related.ts
// A sales order and a purchase order are "related" when one was created from the other
// (sales_orders.source_po_id / purchase_orders.source_so_id). Works from either side.
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient

/** For sales orders: the related purchase order id (the PO it was created from, else the latest PO created from it). */
export async function relatedPurchaseOrders(db: Db, orgId: string, soIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (soIds.length === 0) return out
  const [{ data: forward }, { data: back }] = await Promise.all([
    db.from('sales_orders').select('id, source_po_id').eq('org_id', orgId).in('id', soIds).not('source_po_id', 'is', null),
    db.from('purchase_orders').select('id, source_so_id, created_at').eq('org_id', orgId).in('source_so_id', soIds).order('created_at', { ascending: true }),
  ])
  for (const r of (back ?? []) as { id: string; source_so_id: string }[]) out.set(r.source_so_id, r.id) // later rows win = latest
  for (const r of (forward ?? []) as { id: string; source_po_id: string }[]) out.set(r.id, r.source_po_id)
  return out
}

/** For purchase orders: the related sales order id (the SO it was created from, else the latest SO created from it). */
export async function relatedSalesOrders(db: Db, orgId: string, poIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (poIds.length === 0) return out
  const [{ data: forward }, { data: back }] = await Promise.all([
    db.from('purchase_orders').select('id, source_so_id').eq('org_id', orgId).in('id', poIds).not('source_so_id', 'is', null),
    db.from('sales_orders').select('id, source_po_id, created_at').eq('org_id', orgId).in('source_po_id', poIds).order('created_at', { ascending: true }),
  ])
  for (const r of (back ?? []) as { id: string; source_po_id: string }[]) out.set(r.source_po_id, r.id)
  for (const r of (forward ?? []) as { id: string; source_so_id: string }[]) out.set(r.id, r.source_so_id)
  return out
}

/** True when the id is a real order of this organisation (guards the link written on create). */
export async function ownsOrder(db: Db, orgId: string, table: 'sales_orders' | 'purchase_orders', id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await db.from(table).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
  return data ? id : null
}
