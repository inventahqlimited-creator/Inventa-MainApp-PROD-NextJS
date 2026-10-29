// src/lib/addons-server.ts — server-side add-on lookup. Tolerates the column not existing yet (before the SQL is run): everything is off.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeAddons, type AddonKey, type Addons } from './addons'

export async function loadAddons(db: SupabaseClient, orgId: string): Promise<Addons> {
  const { data } = await db.from('organisations').select('addons').eq('id', orgId).maybeSingle()
  return normalizeAddons((data as { addons?: unknown } | null)?.addons)
}
export async function hasAddon(db: SupabaseClient, orgId: string, key: AddonKey): Promise<boolean> {
  return (await loadAddons(db, orgId))[key]
}
export const ADDON_OFF_MESSAGE = 'Kits & Bundles isn’t switched on for your organisation. Contact us if you’d like it added.'
