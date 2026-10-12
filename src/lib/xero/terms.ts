// src/lib/xero/terms.ts
// Bring payment terms in from Xero: the organisation's default terms, and the terms on each linked contact.
import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroGet } from './api'
import { termFromXero, type PaymentTerm } from '@/lib/payment-terms'

type XTerm = { Day?: number | null; Type?: string | null }
export type XPaymentTerms = { Bills?: XTerm | null; Sales?: XTerm | null }
type XContactTerms = { ContactID: string; IsSupplier?: boolean; IsCustomer?: boolean; PaymentTerms?: XPaymentTerms | null }

/** The term a Xero contact should carry in Inventa: Bills terms for suppliers, Sales terms for customers. */
export function termForContact(c: { IsSupplier?: boolean; IsCustomer?: boolean; PaymentTerms?: XPaymentTerms | null }): PaymentTerm | null {
  const pt = c.PaymentTerms
  if (!pt) return null
  const supplierOnly = !!c.IsSupplier && !c.IsCustomer
  return termFromXero(supplierOnly ? pt.Bills : pt.Sales) ?? termFromXero(supplierOnly ? pt.Sales : pt.Bills)
}

/** Makes sure the org has a term with this name; returns whether it was newly created. */
export async function ensureTerm(db: SupabaseClient, orgId: string, t: PaymentTerm, known?: Set<string>): Promise<boolean> {
  const key = t.name.toLowerCase()
  if (known?.has(key)) return false
  const { data: ex } = await db.from('payment_terms').select('id').eq('org_id', orgId).ilike('name', t.name).maybeSingle()
  if (ex) { known?.add(key); return false }
  const { data: last } = await db.from('payment_terms').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { error } = await db.from('payment_terms').insert({ ...t, org_id: orgId, source: 'xero', sort_order: ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 1 })
  if (error) return false
  known?.add(key)
  return true
}

export type TermsImportResult = { termsAdded: number; contactsUpdated: number; contactsSkipped: number }

/** Imports the org's Xero terms and sets the terms on contacts that are already linked to Xero. */
export async function importPaymentTerms(db: SupabaseClient, orgId: string): Promise<({ ok: true } & TermsImportResult) | { ok: false; status: number; error: string }> {
  const known = new Set<string>()
  let termsAdded = 0

  const org = await xeroGet<{ Organisations?: { PaymentTerms?: XPaymentTerms | null }[] }>(db, orgId, '/Organisation')
  if (!org.ok) return org
  const op = org.data.Organisations?.[0]?.PaymentTerms
  for (const x of [op?.Sales, op?.Bills]) {
    const t = termFromXero(x)
    if (t && await ensureTerm(db, orgId, t, known)) termsAdded++
  }

  const { data: links } = await db.from('xero_sync_records').select('entity_id, xero_id').eq('org_id', orgId).eq('entity', 'contact').not('xero_id', 'is', null)
  const byXero = new Map(((links ?? []) as { entity_id: string; xero_id: string }[]).map(l => [l.xero_id.toLowerCase(), l.entity_id]))

  let contactsUpdated = 0, contactsSkipped = 0
  for (let page = 1; page <= 60; page++) {
    const r = await xeroGet<{ Contacts?: XContactTerms[] }>(db, orgId, `/Contacts?page=${page}`)
    if (!r.ok) return r
    const batch = r.data.Contacts ?? []
    if (batch.length === 0) break
    for (const c of batch) {
      const t = termForContact(c)
      if (!t) continue
      if (await ensureTerm(db, orgId, t, known)) termsAdded++
      const id = byXero.get(String(c.ContactID).toLowerCase())
      if (!id) { contactsSkipped++; continue }
      const { error } = await db.from('contacts').update({ terms: t.name }).eq('id', id).eq('org_id', orgId)
      if (error) contactsSkipped++; else contactsUpdated++
    }
    if (batch.length < 100) break
  }
  return { ok: true, termsAdded, contactsUpdated, contactsSkipped }
}
