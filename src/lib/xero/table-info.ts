// src/lib/xero/table-info.ts
// What the Contacts and Products tables need to show the Xero column: is Xero on and connected,
// can this user post, and the sync status of each record.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { XeroTableInfo } from '@/components/app/xero-sync-ui'
import { xeroInvoiceUrl } from './invoice'
import { xeroBillUrl } from './bill'

export async function loadXeroTableInfo(db: SupabaseClient, orgId: string, entity: 'contact' | 'product' | 'invoice' | 'bill', isAdmin: boolean): Promise<XeroTableInfo> {
  const off: XeroTableInfo = { show: false, canPost: false, records: {} }
  const [{ data: org }, { data: conn }] = await Promise.all([
    db.from('organisations').select('xero_enabled').eq('id', orgId).single(),
    db.from('xero_connections').select('status').eq('org_id', orgId).maybeSingle(),
  ])
  if (!(org as { xero_enabled?: boolean } | null)?.xero_enabled) return off
  if ((conn as { status?: string } | null)?.status !== 'connected') return off

  const { data } = await db.from('xero_sync_records').select('entity_id, xero_id, status, error').eq('org_id', orgId).eq('entity', entity)
  const records: XeroTableInfo['records'] = {}
  for (const r of (data ?? []) as { entity_id: string; xero_id: string | null; status: 'synced' | 'failed'; error: string | null }[]) {
    records[r.entity_id] = { status: r.status, error: r.error, url: r.xero_id ? (entity === 'invoice' ? xeroInvoiceUrl(r.xero_id) : entity === 'bill' ? xeroBillUrl(r.xero_id) : null) : null }
  }
  return { show: true, canPost: isAdmin, records }
}
