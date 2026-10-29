// src/app/api/org/kits/import/route.ts
// POST { csv: string, apply?: boolean } — checks a kit import file (apply false: nothing is saved) or imports it (apply true).
// Needs edit_products and the Kits & Bundles add-on. Returns a result for every row of the file.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { ADDON_OFF_MESSAGE, hasAddon } from '@/lib/addons-server'
import { planKitImport, readImportRows, type ImportProduct } from '@/lib/kits/import'

type Row = Record<string, unknown>
const PAGE = 1000

export async function POST(req: Request) {
  const g = await requirePerm('edit_products')
  if ('res' in g) return g.res
  const { db, orgId, userId, name } = g.access
  if (!(await hasAddon(db, orgId, 'kits'))) return NextResponse.json({ error: ADDON_OFF_MESSAGE }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { csv?: unknown; apply?: unknown } | null
  if (!body || typeof body.csv !== 'string') return NextResponse.json({ error: 'No file was received. Choose a CSV file and try again.' }, { status: 400 })
  if (body.csv.length > 4_000_000) return NextResponse.json({ error: 'The file is too large. Please split it into smaller files.' }, { status: 400 })
  const read = readImportRows(body.csv)
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 })

  // every product of the organisation (matched by SKU)
  const prods: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('products').select('id, name, sku, type, is_kit, is_active, unit, sell_uom').eq('org_id', orgId).not('sku', 'is', null).order('id').range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: 'We couldn’t read your products. Please try again.' }, { status: 500 })
    prods.push(...((data ?? []) as Row[]))
    if ((data ?? []).length < PAGE) break
  }
  // which of the kits named in the file hold stock
  const wanted = new Set(read.rows.map(r => r.kitSku.trim().toLowerCase()).filter(Boolean))
  const kitIds = prods.filter(p => wanted.has(String(p.sku).trim().toLowerCase())).map(p => String(p.id))
  const withStock = new Set<string>()
  for (let i = 0; i < kitIds.length; i += 100) {
    const { data } = await db.from('stock_levels').select('product_id, quantity').eq('org_id', orgId).in('product_id', kitIds.slice(i, i + 100)).neq('quantity', 0)
    for (const r of (data ?? []) as Row[]) withStock.add(String(r.product_id))
  }
  const list: ImportProduct[] = prods.map(p => ({
    id: String(p.id), name: String(p.name ?? ''), sku: (p.sku as string | null) ?? null, type: (p.type as string | null) ?? null,
    is_kit: p.is_kit === true, is_active: p.is_active !== false, unit: ((p.sell_uom as string | null) || (p.unit as string | null)) ?? null, hasStock: withStock.has(String(p.id)),
  }))

  const { results, kits } = planKitImport(read.rows, list)
  const summary = (applied: boolean, failed = 0) => ({ kits: kits.length - failed, rows: results.length, errors: results.filter(r => r.status === 'error').length, skipped: results.filter(r => r.status === 'skipped').length, applied })
  if (body.apply !== true) return NextResponse.json({ results, summary: summary(false) })

  let failed = 0
  for (const k of kits) {
    const fail = (msg: string) => {
      failed++
      for (const r of results) if (r.status === 'ok' && r.kitSku.trim().toLowerCase() === k.sku.trim().toLowerCase()) { r.status = 'error'; r.message = msg }
    }
    const { data: before } = await db.from('product_bom_lines').select('component_id, quantity, guide_price, sort_order').eq('org_id', orgId).eq('kit_id', k.kitId)
    const old = (before ?? []) as Row[]
    if (!k.wasKit) {
      const up = await db.from('products').update({ is_kit: true, track_stock: false }).eq('org_id', orgId).eq('id', k.kitId)
      if (up.error) { console.error('kit import flag failed', up.error.message); fail('We couldn’t make this item a kit. Please try again.'); continue }
    }
    const del = await db.from('product_bom_lines').delete().eq('org_id', orgId).eq('kit_id', k.kitId)
    if (del.error) { fail('We couldn’t replace this kit’s items. Please try again.'); continue }
    const ins = await db.from('product_bom_lines').insert(k.lines.map((l, i) => ({ org_id: orgId, kit_id: k.kitId, component_id: l.component_id, quantity: l.quantity, guide_price: null, sort_order: i })))
    if (ins.error) {
      console.error('kit import failed', ins.error.message)
      if (old.length) await db.from('product_bom_lines').insert(old.map(o => ({ org_id: orgId, kit_id: k.kitId, component_id: o.component_id, quantity: o.quantity, guide_price: o.guide_price, sort_order: o.sort_order })))
      fail('We couldn’t save this kit’s items. Its previous items were kept.')
      continue
    }
    for (const r of results) if (r.status === 'ok' && r.kitSku.trim().toLowerCase() === k.sku.trim().toLowerCase()) r.message = k.wasKit ? `Imported: the kit’s items were replaced (${k.lines.length} item${k.lines.length === 1 ? '' : 's'}).` : `Imported: now a kit with ${k.lines.length} item${k.lines.length === 1 ? '' : 's'}.`
    await db.from('audit_log').insert({
      org_id: orgId, category: 'Inventory', action: 'Bill of Materials Imported', ref: k.sku || k.name,
      detail: `${k.lines.length} item${k.lines.length === 1 ? '' : 's'} (was ${old.length})${k.wasKit ? '' : ', made a kit'}`, entity_type: 'products', entity_id: k.kitId, user_id: userId, user_name: name,
    })
  }
  return NextResponse.json({ results, summary: summary(true, failed) })
}
