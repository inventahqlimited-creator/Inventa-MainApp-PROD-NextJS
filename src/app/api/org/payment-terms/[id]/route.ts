// src/app/api/org/payment-terms/[id]/route.ts
// Edit or remove one payment term. Renaming also renames it everywhere it is stored as text.
import { NextResponse } from 'next/server'
import { requireAnyPerm } from '@/lib/auth/access'
import { validateTerm } from '@/lib/payment-terms'

type Params = { params: Promise<{ id: string }> }
const PERMS = ['manage_sales_settings', 'manage_purchase_settings', 'manage_contact_settings'] as const

export async function PATCH(req: Request, { params }: Params) {
  const g = await requireAnyPerm(...PERMS)
  if ('res' in g) return g.res
  const { id } = await params
  const { db, orgId } = g.access
  const { data: cur } = await db.from('payment_terms').select('id, name').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const v = validateTerm(body)
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const oldName = (cur as { name: string }).name
  if (v.value.name.toLowerCase() !== oldName.toLowerCase()) {
    const { data: dup } = await db.from('payment_terms').select('id').eq('org_id', orgId).ilike('name', v.value.name).maybeSingle()
    if (dup) return NextResponse.json({ error: `There is already a payment term called "${v.value.name}".` }, { status: 409 })
  }
  const { error } = await db.from('payment_terms').update(v.value).eq('id', id).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: 'Could not save the payment term.' }, { status: 500 })
  if (v.value.name !== oldName) {
    await Promise.all([
      db.from('contacts').update({ terms: v.value.name }).eq('org_id', orgId).eq('terms', oldName),
      db.from('sales_orders').update({ terms: v.value.name }).eq('org_id', orgId).eq('terms', oldName),
      db.from('purchase_orders').update({ terms: v.value.name }).eq('org_id', orgId).eq('terms', oldName),
      db.from('organisations').update({ so_default_payment_terms: v.value.name }).eq('id', orgId).eq('so_default_payment_terms', oldName),
      db.from('organisations').update({ po_default_payment_terms: v.value.name }).eq('id', orgId).eq('po_default_payment_terms', oldName),
    ])
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const g = await requireAnyPerm(...PERMS)
  if ('res' in g) return g.res
  const { id } = await params
  const { db, orgId } = g.access
  const { data: cur } = await db.from('payment_terms').select('id, name').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const name = (cur as { name: string }).name
  const [{ count }, { data: org }] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('terms', name),
    db.from('organisations').select('so_default_payment_terms, po_default_payment_terms').eq('id', orgId).single(),
  ])
  const o = (org ?? {}) as { so_default_payment_terms?: string | null; po_default_payment_terms?: string | null }
  if (o.so_default_payment_terms === name || o.po_default_payment_terms === name) return NextResponse.json({ error: `"${name}" is the default payment term in Sales or Purchases settings. Choose another default first.` }, { status: 400 })
  if ((count ?? 0) > 0) return NextResponse.json({ error: `${count} contact${count === 1 ? ' uses' : 's use'} "${name}". Move ${count === 1 ? 'it' : 'them'} to another term first.` }, { status: 400 })
  const { error } = await db.from('payment_terms').delete().eq('id', id).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: 'Could not remove the payment term.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
