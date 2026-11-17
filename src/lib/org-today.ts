import type { SupabaseClient } from '@supabase/supabase-js'

// Today's date (YYYY-MM-DD) in the organisation's time zone, not the server's UTC date —
// in NZ/Australia the UTC date is still "yesterday" until midday or later.
export function todayInZone(tz: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  }
}

export async function orgToday(db: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await db.from('organisations').select('timezone').eq('id', orgId).maybeSingle()
  return todayInZone((data as { timezone?: string | null } | null)?.timezone)
}
