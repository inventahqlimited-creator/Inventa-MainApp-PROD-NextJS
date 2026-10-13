// src/lib/qty-server.ts
// Server-side guard for the "Allow Decimal Quantities" setting: whole numbers when it is off (and always for
// serial-tracked products), and no more decimal places than the setting allows.
import type { SupabaseClient } from '@supabase/supabase-js'
import { qtyFmtFromOrg, qtyPlaces } from '@/lib/qty'

/** Returns an error message for the first quantity that breaks the rules, or null. */
export async function checkLineQuantities(db: SupabaseClient, orgId: string, lines: Record<string, unknown>[], key: 'quantity' | 'quantity_ordered'): Promise<string | null> {
  const [{ data: org }, { data: serial }] = await Promise.all([
    db.from('organisations').select('decimal_qty, decimal_qty_places').eq('id', orgId).single(),
    db.from('products').select('id').eq('org_id', orgId).eq('serial_tracking', true),
  ])
  const f = qtyFmtFromOrg(org as { decimal_qty?: unknown; decimal_qty_places?: unknown } | null)
  const serialIds = new Set(((serial ?? []) as { id: string }[]).map(r => r.id))
  for (const l of lines) {
    const n = Number(l[key])
    if (!Number.isFinite(n)) continue
    const places = qtyPlaces(f, serialIds.has(String(l.product_id ?? '')))
    if (Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) > 1e-6) {
      const name = String(l.product_name ?? 'a product')
      return places === 0
        ? `Quantity for ${name} must be a whole number${f.decimals ? ' (serial-tracked products are always whole)' : ' — decimal quantities are switched off in Settings'}.`
        : `Quantity for ${name} can have at most ${places} decimal place${places === 1 ? '' : 's'}.`
    }
  }
  return null
}
