// src/app/api/org/search/route.ts
// Global top-bar search: contacts, products, sales, purchases, transfers (never reports / settings).
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAccess, can } from '@/lib/auth/access'

const LIMIT = 5

export type SearchHit = {
  group: 'Contacts' | 'Products' | 'Sales' | 'Purchases' | 'Transfers'
  id: string
  label: string
  sub: string
  href: string
}

// strip characters that have a meaning inside a PostgREST or() filter / ilike pattern
function clean(q: string) {
  return q.replace(/[%_,()*\\"']/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = clean(new URL(req.url).searchParams.get('q') ?? '')
  if (q.length < 1) return NextResponse.json({ results: [] })

  // Same rule as the sidebar: each group is only searched if the person may view that module.
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = access.db
  const orgId = access.orgId
  const none = Promise.resolve({ data: [] as never[] })

  const like = `%${q}%`
  const results: SearchHit[] = []

  const [contacts, products, sales, purchases, transfers] = await Promise.all([
    can(access, 'view_contacts')
      ? db.from('contacts').select('id, name, type, email, phone')
          .eq('org_id', orgId).or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .order('name').limit(LIMIT)
      : none,
    can(access, 'view_products')
      ? db.from('products').select('id, name, sku, type, barcode')
          .eq('org_id', orgId).or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`)
          .order('name').limit(LIMIT)
      : none,
    can(access, 'view_sales') ? db.from('sales_orders').select('id, so_number, customer_name, status, reference')
      .eq('org_id', orgId).or(`so_number.ilike.${like},customer_name.ilike.${like},reference.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(LIMIT) : none,
    can(access, 'view_purchases') ? db.from('purchase_orders').select('id, po_number, supplier_name, status, reference')
      .eq('org_id', orgId).or(`po_number.ilike.${like},supplier_name.ilike.${like},reference.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(LIMIT) : none,
    can(access, 'view_transfers') ? db.from('transfer_orders').select('id, tr_number, from_location_name, to_location_name, status')
      .eq('org_id', orgId).or(`tr_number.ilike.${like},from_location_name.ilike.${like},to_location_name.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(LIMIT) : none,
  ])

  for (const c of (contacts.data ?? []) as { id: string; name: string; type: string | null; email: string | null; phone: string | null }[]) {
    const kind = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : 'Contact'
    results.push({ group: 'Contacts', id: c.id, label: c.name, sub: kind + (c.email ? ` · ${c.email}` : c.phone ? ` · ${c.phone}` : ''), href: `/contacts?open=${c.id}` })
  }
  for (const p of (products.data ?? []) as { id: string; name: string; sku: string | null; type: string | null }[]) {
    results.push({ group: 'Products', id: p.id, label: p.name, sub: [p.sku, p.type].filter(Boolean).join(' · '), href: `/products?open=${p.id}` })
  }
  for (const s of (sales.data ?? []) as { id: string; so_number: string | null; customer_name: string | null; status: string | null }[]) {
    results.push({ group: 'Sales', id: s.id, label: s.so_number ?? 'Sales order', sub: [s.customer_name, s.status].filter(Boolean).join(' · '), href: `/sales/${s.id}` })
  }
  for (const p of (purchases.data ?? []) as { id: string; po_number: string | null; supplier_name: string | null; status: string | null }[]) {
    results.push({ group: 'Purchases', id: p.id, label: p.po_number ?? 'Purchase order', sub: [p.supplier_name, p.status].filter(Boolean).join(' · '), href: `/purchases/${p.id}` })
  }
  for (const t of (transfers.data ?? []) as { id: string; tr_number: string | null; from_location_name: string | null; to_location_name: string | null; status: string | null }[]) {
    const route = t.from_location_name && t.to_location_name ? `${t.from_location_name} → ${t.to_location_name}` : ''
    results.push({ group: 'Transfers', id: t.id, label: t.tr_number ?? 'Transfer', sub: [route, t.status].filter(Boolean).join(' · '), href: `/transfers/${t.id}` })
  }

  return NextResponse.json({ results })
}
