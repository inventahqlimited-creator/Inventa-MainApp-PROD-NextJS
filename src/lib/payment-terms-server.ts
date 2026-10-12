// src/lib/payment-terms-server.ts
// Loads an organisation's payment terms (falls back to the standard list if the table is empty or missing).
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TERMS, type PaymentTerm, type TermType } from './payment-terms'

export async function loadTerms(db: SupabaseClient, orgId: string): Promise<PaymentTerm[]> {
  const { data, error } = await db.from('payment_terms').select('name, type, days').eq('org_id', orgId).order('sort_order')
  if (error || !data || data.length === 0) return DEFAULT_TERMS
  return (data as { name: string; type: TermType; days: number }[]).map(t => ({ name: t.name, type: t.type, days: t.days }))
}
