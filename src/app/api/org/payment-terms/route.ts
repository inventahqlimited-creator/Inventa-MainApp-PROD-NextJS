// src/app/api/org/payment-terms/route.ts
// The organisation's payment terms list. GET lists (and seeds the standard list the first time); POST adds one.
import { NextResponse } from 'next/server'
import { getAccess, requireAnyPerm } from '@/lib/auth/access'
import { DEFAULT_TERMS, validateTerm } from '@/lib/payment-terms'

const PERMS = ['manage_sales_settings', 'manage_purchase_settings', 'manage_contact_settings'] as const

export async function GET() {
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, orgId } = access
  let { data, error } = await db.from('payment_terms').select('id, name, type, days, source, sort_order').eq('org_id', orgId).order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: 'Payment terms aren\'t set up yet — run the Release E SQL.' }, { status: 500 })
  if (!data || data.length === 0) {
    const seeded = await db.from('payment_terms').insert(DEFAULT_TERMS.map((t, i) => ({ ...t, org_id: orgId, sort_order: i + 1 }))).select('id, name, type, days, source, sort_order')
    data = seeded.data
  }
  const terms = (data ?? []) as { id: string; name: string }[]
  // How many contacts use each term, so Settings can warn before one is removed
  const { data: cs } = await db.from('contacts').select('terms').eq('org_id', orgId).not('terms', 'is', null)
  const counts = new Map<string, number>()
  for (const c of (cs ?? []) as { terms: string }[]) counts.set(c.terms.toLowerCase(), (counts.get(c.terms.toLowerCase()) ?? 0) + 1)
  return NextResponse.json(terms.map(t => ({ ...t, contacts: counts.get(t.name.toLowerCase()) ?? 0 })))
}

export async function POST(req: Request) {
  const g = await requireAnyPerm(...PERMS)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({}))
  const v = validateTerm(body)
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const { db, orgId } = g.access
  const { data: dup } = await db.from('payment_terms').select('id').eq('org_id', orgId).ilike('name', v.value.name).maybeSingle()
  if (dup) return NextResponse.json({ error: `There is already a payment term called "${v.value.name}".` }, { status: 409 })
  const { data: last } = await db.from('payment_terms').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('payment_terms').insert({ ...v.value, org_id: orgId, sort_order: ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 1 }).select('id, name, type, days, source, sort_order').single()
  if (error) return NextResponse.json({ error: 'Could not save the payment term.' }, { status: 500 })
  return NextResponse.json({ ...data, contacts: 0 })
}
