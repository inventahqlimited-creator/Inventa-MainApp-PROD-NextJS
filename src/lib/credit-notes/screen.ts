// src/lib/credit-notes/screen.ts
// Everything the credit note screen needs, for a new credit note (from an order) or an existing one.
import type { Access } from '@/lib/auth/access'
import { discountFactor, invoiceNumberFor, loadClosedOrder, loadSettings, returnedByLine, soldTracking } from './server'

type Row = Record<string, unknown>
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export type ScreenLine = {
  id: string; product_name: string; product_sku: string; unit: string; shipped: number; returned: number
  unit_price: number; discount: number; tax_rate: number
  stock: boolean; serial: boolean; batch: boolean; serials: string[]; batches: string[]
}
export type ScreenRow = { so_line_id: string; quantity: number; bin_id: string | null; serial_number: string | null; batch_number: string | null; expiry_date: string | null }
export type ScreenData = {
  cn: { id: string | null; cn_number: string | null; status: 'New' | 'Open' | 'Closed' | 'Cancelled'; return_date: string; reason: string; notes: string; location_id: string; currency: string; total_amount: number; closed_at: string | null }
  so: { id: string; so_number: string; invoice_number: string | null; customer_name: string }
  lines: ScreenLine[]
  rows: ScreenRow[]
  locations: { id: string; name: string }[]
  bins: { id: string; location_id: string; name: string }[]
  decimals: number
  xero: { show: boolean; status: 'synced' | 'failed' | null; error: string | null; xeroId: string | null }
}

export async function loadReturnScreen(a: Access, opts: { so?: string; id?: string }): Promise<ScreenData | { redirect: string }> {
  const { db, orgId } = a
  const settings = await loadSettings(db, orgId)
  let existing: Row | null = null
  let soId = opts.so ?? ''
  if (opts.id) {
    const { data } = await db.from('credit_notes').select('*, credit_note_lines(*)').eq('org_id', orgId).eq('id', opts.id).maybeSingle()
    if (!data) return { redirect: '/sales/returns' }
    existing = data as Row
    soId = String(existing.so_id)
  } else {
    if (!settings.enabled) return { redirect: '/sales' }
    if (!/^[0-9a-f-]{36}$/i.test(soId)) return { redirect: '/sales' }
  }

  const loaded = await loadClosedOrder(db, orgId, soId)
  if ('error' in loaded) return { redirect: opts.id ? '/sales/returns' : `/sales/${soId}` }
  const { order, lines, costsTotal } = loaded
  const factor = discountFactor(order, lines, costsTotal)
  const returned = await returnedByLine(db, orgId, soId, opts.id)
  const productIds = [...new Set(lines.map(l => String(l.product_id)))]
  const [{ data: prods }, sold, { data: locs }, { data: bins }, { data: org }] = await Promise.all([
    db.from('products').select('id, serial_tracking, batch_tracking, track_stock, type').in('id', productIds),
    soldTracking(db, orgId, soId),
    db.from('locations').select('id, name').eq('org_id', orgId).eq('active', true).order('name'),
    db.from('bins').select('id, location_id, name, is_active').eq('org_id', orgId).order('name'),
    db.from('organisations').select('decimal_places, xero_enabled, so_prefix, so_suffix').eq('id', orgId).single(),
  ])
  const prodById = new Map(((prods ?? []) as Row[]).map(p => [String(p.id), p]))
  const orgRow = (org ?? {}) as { decimal_places?: number | null; xero_enabled?: boolean | null }

  const screenLines: ScreenLine[] = lines.map(l => {
    const p = prodById.get(String(l.product_id)) ?? {}
    const t = sold.get(String(l.product_id))
    const stock = p.track_stock !== false && p.type !== 'Service' && l.is_kit_parent !== true
    const eff = Math.round((1 - (1 - num(l.discount) / 100) * factor) * 100 * 10000) / 10000
    return {
      id: String(l.id), product_name: String(l.product_name ?? 'Item'), product_sku: String(l.product_sku ?? ''), unit: String(l.unit ?? ''),
      shipped: num(l.quantity_shipped) || num(l.quantity), returned: returned.get(String(l.id)) ?? 0,
      unit_price: num(l.unit_price), discount: eff > 0 ? eff : 0, tax_rate: num(l.tax_rate),
      stock, serial: stock && p.serial_tracking === true, batch: stock && p.batch_tracking === true,
      serials: [...(t?.serials ?? [])].sort(), batches: [...(t?.batches ?? [])].sort(),
    }
  })

  const rows: ScreenRow[] = existing
    ? ((existing.credit_note_lines ?? []) as Row[]).sort((x, y) => num(x.sort_order) - num(y.sort_order)).map(r => ({
        so_line_id: String(r.so_line_id), quantity: num(r.quantity), bin_id: (r.bin_id as string | null) ?? null,
        serial_number: (r.serial_number as string | null) ?? null, batch_number: (r.batch_number as string | null) ?? null,
        expiry_date: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
      }))
    : []

  let xero: ScreenData['xero'] = { show: false, status: null, error: null, xeroId: null }
  if (orgRow.xero_enabled) {
    const { data: conn } = await db.from('xero_connections').select('status').eq('org_id', orgId).maybeSingle()
    const connected = (conn as { status?: string } | null)?.status === 'connected'
    type Rec = { status: 'synced' | 'failed'; error: string | null; xero_id: string | null }
    let rec = null as Rec | null
    if (existing) {
      const { data } = await db.from('xero_sync_records').select('status, error, xero_id').eq('org_id', orgId).eq('entity', 'credit_note').eq('entity_id', String(existing.id)).maybeSingle()
      rec = data as Rec | null
    }
    xero = { show: connected, status: rec?.status ?? null, error: rec?.error ?? null, xeroId: rec?.xero_id ?? null }
  }

  const invoice = existing ? (existing.invoice_number as string | null) ?? null : null
  let invoiceNo = invoice
  if (!invoiceNo) {
    invoiceNo = await invoiceNumberFor(db, orgId, soId)
  }

  return {
    cn: {
      id: existing ? String(existing.id) : null, cn_number: existing ? String(existing.cn_number) : null,
      status: existing ? (existing.status as 'Open' | 'Closed' | 'Cancelled') : 'New',
      return_date: existing?.return_date ? String(existing.return_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      reason: existing ? String(existing.reason ?? '') : '', notes: existing ? String(existing.notes ?? '') : '',
      location_id: existing ? String(existing.location_id ?? '') : String(order.location_id ?? ''),
      currency: String(existing?.currency ?? order.currency ?? ''), total_amount: num(existing?.total_amount),
      closed_at: existing?.closed_at ? String(existing.closed_at) : null,
    },
    so: { id: soId, so_number: String(order.so_number ?? ''), invoice_number: invoiceNo, customer_name: String(order.customer_name ?? '') },
    lines: screenLines, rows,
    locations: (locs ?? []) as { id: string; name: string }[],
    bins: ((bins ?? []) as { id: string; location_id: string; name: string; is_active: boolean | null }[]).filter(b => b.is_active !== false).map(b => ({ id: b.id, location_id: b.location_id, name: b.name })),
    decimals: Number.isFinite(Number(orgRow.decimal_places)) ? Number(orgRow.decimal_places) : 2,
    xero,
  }
}
