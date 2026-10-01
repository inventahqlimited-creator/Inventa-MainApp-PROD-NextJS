// src/app/api/org/transfers/shared.ts
// Shared helpers for the transfer API routes (mirrors the sales order helpers).

const TR_FIELDS = [
  'from_location_id', 'to_location_id', 'from_location_name', 'to_location_name',
  'status', 'transfer_date', 'expected_date', 'notes',
] as const

export function pickTR(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of TR_FIELDS) if (body[k] !== undefined) out[k] = body[k] === '' ? null : body[k]
  return out
}

const num = (v: unknown, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const str = (v: unknown) => (v == null || v === '' ? null : String(v))

export function lineRow(l: Record<string, unknown>, i: number) {
  return {
    product_id: l.product_id as string,
    product_name: str(l.product_name),
    product_sku: str(l.product_sku),
    unit: str(l.unit) ?? 'Each',
    quantity: num(l.quantity),
    from_bin_id: str(l.from_bin_id),
    to_bin_id: str(l.to_bin_id),
    sort_order: i,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

// Next number from Settings → Transfers (prefix / digits / suffix / start)
export async function nextTrNumber(db: Db, orgId: string): Promise<string> {
  const { data: org } = await db
    .from('organisations')
    .select('tr_prefix, tr_suffix, tr_start, tr_digits')
    .eq('id', orgId)
    .single()
  const prefix: string = org?.tr_prefix ?? 'TR-'
  const suffix: string = org?.tr_suffix ?? ''
  const start: number = Number(org?.tr_start) || 1
  const digits: number = Number(org?.tr_digits) || 4

  const { data: existing, error } = await db
    .from('transfer_orders')
    .select('tr_number')
    .eq('org_id', orgId)
    .not('tr_number', 'is', null)
  if (error) throw new Error(error.message)

  let max = start - 1
  for (const row of (existing ?? []) as { tr_number: string }[]) {
    let n = row.tr_number
    if (prefix && n.startsWith(prefix)) n = n.slice(prefix.length)
    if (suffix && n.endsWith(suffix)) n = n.slice(0, -suffix.length)
    const v = parseInt(n, 10)
    if (/^\d+$/.test(n) && v > max) max = v
  }
  return `${prefix}${String(max + 1).padStart(digits, '0')}${suffix}`
}

// Only stocked products can be transferred; bins must belong to the right location.
export async function validateTransfer(
  db: Db,
  orgId: string,
  fromLocationId: string | null,
  toLocationId: string | null,
  lines: Record<string, unknown>[],
): Promise<string | null> {
  const ids = [...new Set(lines.map(l => l.product_id as string).filter(Boolean))]
  if (ids.length) {
    const { data: prods } = await db.from('products').select('id, name, type, track_stock').eq('org_id', orgId).in('id', ids)
    const byId = new Map(((prods ?? []) as { id: string; name: string; type: string | null; track_stock: boolean | null }[]).map(p => [p.id, p]))
    for (const id of ids) {
      const p = byId.get(id)
      if (!p) return 'One of the products could not be found.'
      if (p.track_stock === false || p.type !== 'Stock') return `"${p.name}" isn't a stocked item, so it can't be transferred.`
    }
  }
  const binIds = [...new Set(lines.flatMap(l => [l.from_bin_id, l.to_bin_id]).filter((x): x is string => typeof x === 'string' && x !== ''))]
  if (binIds.length) {
    const { data: bins } = await db.from('bins').select('id, location_id').eq('org_id', orgId).in('id', binIds)
    const loc = new Map(((bins ?? []) as { id: string; location_id: string }[]).map(b => [b.id, b.location_id]))
    for (const l of lines) {
      if (typeof l.from_bin_id === 'string' && l.from_bin_id && loc.get(l.from_bin_id) !== fromLocationId) return 'A From Bin doesn\'t belong to the From location.'
      if (typeof l.to_bin_id === 'string' && l.to_bin_id && loc.get(l.to_bin_id) !== toLocationId) return 'A To Bin doesn\'t belong to the To location.'
    }
  }
  return null
}
