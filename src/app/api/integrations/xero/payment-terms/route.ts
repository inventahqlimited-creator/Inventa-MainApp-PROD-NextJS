// src/app/api/integrations/xero/payment-terms/route.ts
// POST — import Xero's payment terms and set the terms on contacts already linked to Xero. Admin only.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { importPaymentTerms } from '@/lib/xero/terms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const g = await guardXero(true)
  if ('res' in g) return g.res
  const r = await importPaymentTerms(g.a.db, g.a.orgId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status === 429 ? 429 : 502 })
  return NextResponse.json({ termsAdded: r.termsAdded, contactsUpdated: r.contactsUpdated, contactsSkipped: r.contactsSkipped })
}
