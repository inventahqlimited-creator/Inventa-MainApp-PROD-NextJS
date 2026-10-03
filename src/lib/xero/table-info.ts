// src/lib/xero/table-info.ts
// What the Contacts and Products tables need to show the Xero column: is Xero on and connected,
// can this user post, and the sync status of each record.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { XeroTableInfo } from '@/components/app/xero-sync-ui'

export async function loadXeroTableInfo(db: SupabaseClient, orgId: string, entity: 'contact' | 'product', isAdmin: boolean): Promise<XeroTableInfo> {
  const off: XeroTableInfo = { show: false, canPost: false, records: {} }
  const [{ data: org }, { data: conn }] = await Promise.all([
    db.from('organisations').select('xero_enabled').eq('id', orgId).single(),
    db.from('xero_connections').select('status').eq('org_id', orgId).maybeSingle(),
  ])
  if (!(org as { xero_enabled?: boolean } | null)?.xero_enabled) return off
  if ((conn as { status?: string } | null)?.status !== 'connected') return off

  const { data } = await db.from('xero_sync_records').select('entity_id, status, error').eq('org_id', orgId).eq('entity', entity)
  const records: XeroTableInfo['records'] = {}
  for (const r of (data ?? []) as { entity_id: string; status: 'synced' | 'failed'; error: string | null }[]) records[r.entity_id] = { status: r.status, error: r.error }
  return { show: true, canPost: isAdmin, records }
}
