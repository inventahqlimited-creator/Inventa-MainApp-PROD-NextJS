// src/lib/kits/settings-server.ts — reads an organisation's kit settings. Tolerates the column not existing yet (defaults apply).
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeKitSettings, type KitSettings } from './settings'

export async function loadKitSettings(db: SupabaseClient, orgId: string): Promise<KitSettings> {
  const { data } = await db.from('organisations').select('kit_settings').eq('id', orgId).maybeSingle()
  return normalizeKitSettings((data as { kit_settings?: unknown } | null)?.kit_settings)
}
