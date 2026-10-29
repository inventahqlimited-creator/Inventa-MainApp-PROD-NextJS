// src/app/api/org/products/[id]/bom/route.ts
// A kit's Bill of Materials.
//   GET → { enabled, is_kit, lines[], cost_total, guide_total }   (needs view_products)
//   PUT { lines: [{ component_id, quantity, guide_price? }] } → replaces the whole list   (needs edit_products, Kits & Bundles switched on)
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'
import { saveError } from '@/lib/api/db-error'
import { ADDON_OFF_MESSAGE, hasAddon } from '@/lib/addons-server'
import { guideTotal, kitCost, parseBomLines, productCost } from '@/lib/kits/bom'

type Params = { params: Promise<{ id: string }> }
type Row = Record<string, unknown>
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function GET(_req: Request, { params }: Params) {
  const g = await requirePerm('view_products')
  if ('res' in g) return g.res
  const { db, orgId } = g.access
  const { id } = await params
  if (!isId(id)) return NextResponse.json({ error: 'Invalid product' }, { status: 400 })

  const enabled = await hasAddon(db, orgId, 'kits')
  const { data: kit } = await db.from('products').select('id, is_kit').eq('org_id', orgId).eq('id', id).maybeSingle()
  if (!kit) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  const isKit = enabled && (kit as Row).is_kit === true
  if (!isKit) return NextResponse.json({ enabled, is_kit: false, lines: [], cost_total: 0, guide_total: 0 })

  const { data: bom } = await db.from('product_bom_lines').select('id, component_id, quantity, guide_price, sort_order').eq('org_id', orgId).eq('kit_id', id)
  const rows = ((bom ?? []) as Row[]).sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
  const ids = rows.map(r => String(r.component_id))
  const { data: prods } = ids.length
    ? await db.from('products').select('id, name, sku, unit, type, sell_price, cost_price, avg_cost, last_cost, is_active').eq('org_id', orgId).in('id', ids)
    : { data: [] as Row[] }
  const byId = new Map(((prods ?? []) as Row[]).map(p => [String(p.id), p]))
  const lines = rows.map(r => {
    const p = byId.get(String(r.component_id)) ?? {}
    return {
      id: String(r.id), component_id: String(r.component_id), name: (p.name as string) ?? 'Removed item', sku: (p.sku as string) ?? null,
      unit: (p.unit as string) ?? null, type: (p.type as string) ?? null, is_active: p.is_active !== false,
      quantity: Number(r.quantity), guide_price: r.guide_price === null ? null : Number(r.guide_price),
      sell_price: Number(p.sell_price) || 0, cost: productCost(p),
    }
  })
  return NextResponse.json({
    enabled, is_kit: true, lines,
    cost_total: kitCost(lines), guide_total: guideTotal(lines),
  })
}

export async function PUT(req: Request, { params }: Params) {
  const g = await requirePerm('edit_products')
  if ('res' in g) return g.res
  const { db, orgId, userId, name } = g.access
  const { id } = await params
  if (!isId(id)) return NextResponse.json({ error: 'Invalid product' }, { status: 400 })
  if (!(await hasAddon(db, orgId, 'kits'))) return NextResponse.json({ error: ADDON_OFF_MESSAGE }, { status: 403 })

  const parsed = parseBomLines(((await req.json().catch(() => null)) as { lines?: unknown } | null)?.lines)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: kit } = await db.from('products').select('id, name, sku, type, is_kit').eq('org_id', orgId).eq('id', id).maybeSingle()
  if (!kit) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  const k = kit as Row
  if (k.type !== 'NonStock') return NextResponse.json({ error: 'A kit has to be a Non Stock item. Change the stock type to Non Stock first.' }, { status: 400 })
  if (k.is_kit !== true) return NextResponse.json({ error: 'Tick “This item is a kit / bundle” on the product first.' }, { status: 400 })

  // every component must be an item of this organisation, not a kit and not the kit itself
  const ids = parsed.lines.map(l => l.component_id)
  if (ids.includes(id)) return NextResponse.json({ error: 'A kit can’t contain itself.' }, { status: 400 })
  if (ids.length) {
    const { data: comps } = await db.from('products').select('id, name, is_kit').eq('org_id', orgId).in('id', ids)
    const found = new Map(((comps ?? []) as Row[]).map(c => [String(c.id), c]))
    for (const cid of ids) {
      const c = found.get(cid)
      if (!c) return NextResponse.json({ error: 'One of the items could not be found. Please refresh the page and try again.' }, { status: 400 })
      if (c.is_kit === true) return NextResponse.json({ error: `“${c.name}” is itself a kit, and kits can’t contain other kits.` }, { status: 400 })
    }
  }

  const { data: before } = await db.from('product_bom_lines').select('component_id, quantity, guide_price, sort_order').eq('org_id', orgId).eq('kit_id', id)
  const old = (before ?? []) as Row[]
  const toRow = (l: { component_id: string; quantity: number; guide_price: number | null }, i: number) => ({ org_id: orgId, kit_id: id, component_id: l.component_id, quantity: l.quantity, guide_price: l.guide_price, sort_order: i })

  const del = await db.from('product_bom_lines').delete().eq('org_id', orgId).eq('kit_id', id)
  if (del.error) { const e = saveError(del.error, 'kit'); return NextResponse.json({ error: e.message }, { status: e.status }) }
  if (parsed.lines.length) {
    const ins = await db.from('product_bom_lines').insert(parsed.lines.map(toRow))
    if (ins.error) {
      // put the previous list back so a failed save never leaves the kit empty
      if (old.length) await db.from('product_bom_lines').insert(old.map(o => ({ org_id: orgId, kit_id: id, component_id: o.component_id, quantity: o.quantity, guide_price: o.guide_price, sort_order: o.sort_order })))
      console.error('bom save failed', ins.error.message)
      const e = saveError(ins.error, 'kit'); return NextResponse.json({ error: e.message }, { status: e.status })
    }
  }

  await db.from('audit_log').insert({
    org_id: orgId, category: 'Inventory', action: 'Bill of Materials Updated', ref: (k.sku as string) || (k.name as string),
    detail: `${parsed.lines.length} item${parsed.lines.length === 1 ? '' : 's'} (was ${old.length})`, entity_type: 'products', entity_id: id, user_id: userId, user_name: name,
  })
  return NextResponse.json({ success: true, count: parsed.lines.length })
}
