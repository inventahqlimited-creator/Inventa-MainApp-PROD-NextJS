// src/lib/xero/audit.ts
// Writes Xero activity (posted, failed, synced) into the Audit Log, so it also shows in an order's Order History.
// Who did it: the signed-in person (set once per request by xeroAuth), or "Xero auto-sync" when the schedule ran it.
// Logging never stops or fails a post.
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient
type Actor = { id: string | null; name: string | null }

const actors = new WeakMap<object, Actor>()
export const setActor = (db: Db, actor: Actor) => { actors.set(db, actor) }

export type XeroAuditEntry = {
  action: string
  ref: string | null
  detail: string | null
  /** The record the entry belongs to: 'sales_orders', 'purchase_orders', 'adjustment_orders', 'contacts' or 'products'. */
  entity_type: string
  entity_id: string | null
}

export async function logXero(db: Db, orgId: string, e: XeroAuditEntry): Promise<void> {
  try {
    const who = actors.get(db)
    await db.from('audit_log').insert({
      org_id: orgId,
      category: 'Xero',
      action: e.action,
      ref: e.ref,
      detail: e.detail ? e.detail.slice(0, 500) : null,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      user_id: who?.id ?? null,
      user_name: who ? who.name : 'Xero auto-sync',
    })
  } catch {
    /* the audit trail must never break a post */
  }
}

const TABLE = {
  invoice: { table: 'sales_orders', numberCol: 'so_number', type: 'sales_orders', noun: 'invoice', Noun: 'Invoice' },
  bill: { table: 'purchase_orders', numberCol: 'po_number', type: 'purchase_orders', noun: 'bill', Noun: 'Bill' },
  adjustment: { table: 'adjustment_orders', numberCol: 'adj_number', type: 'adjustment_orders', noun: 'journal', Noun: 'Journal' },
} as const

/** One audit line for a document that was posted to Xero, or that Xero refused. */
export async function auditPost(
  db: Db, orgId: string, entity: 'invoice' | 'bill' | 'adjustment', id: string,
  rec: { status: 'synced' | 'failed'; error: string | null; number?: string | null; postedAs?: string | null },
): Promise<void> {
  try {
    const t = TABLE[entity]
    let ref = rec.number ?? null
    if (!ref) {
      const { data } = await db.from(t.table).select(t.numberCol).eq('id', id).maybeSingle()
      ref = ((data as Record<string, string | null> | null)?.[t.numberCol]) ?? null
    }
    if (rec.status === 'synced') {
      const as = rec.postedAs === 'AUTHORISED' ? 'approved' : rec.postedAs === 'POSTED' ? 'posted' : rec.postedAs === 'DRAFT' ? 'draft' : null
      await logXero(db, orgId, {
        action: `Posted to Xero`, ref, entity_type: t.type, entity_id: id,
        detail: `${t.Noun}${rec.number ? ` ${rec.number}` : ''} sent to Xero${as ? ` as ${as}` : ''}${rec.error ? ` · Note: ${rec.error}` : ''}`,
      })
    } else {
      await logXero(db, orgId, {
        action: 'Xero Post Failed', ref, entity_type: t.type, entity_id: id,
        detail: `Could not send the ${t.noun} to Xero · ${rec.error ?? 'Unknown error'}`,
      })
    }
  } catch { /* ignore */ }
}
