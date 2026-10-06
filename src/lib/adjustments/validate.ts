// src/lib/adjustments/validate.ts
// Cleans and checks the body of a stock adjustment before it is saved.
import { pick } from '@/lib/api/sanitize'

export const ADJ_HEADER_FIELDS = ['location_id', 'location_name', 'adjustment_date', 'reason', 'notes'] as const
export const ADJ_LINE_FIELDS = ['product_id', 'product_name', 'product_sku', 'unit', 'quantity_before', 'quantity_after', 'reason', 'sort_order', 'batch_number', 'serial_number', 'expiry_date', 'bin_id'] as const
export const MAX_ADJ_LINES = 2000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

type Row = Record<string, unknown>

/**
 * Returns the cleaned header and lines, or an error message.
 * `lines` may be undefined (header-only update).
 */
export function cleanAdjustment(body: unknown): { header: Row; lines?: Row[]; error?: undefined } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request' }
  const b = body as Row
  const header = pick(b, ADJ_HEADER_FIELDS)!
  if (header.location_id !== undefined && (typeof header.location_id !== 'string' || !UUID_RE.test(header.location_id))) return { error: 'Invalid location' }

  let lines: Row[] | undefined
  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines)) return { error: 'Invalid lines' }
    if (b.lines.length > MAX_ADJ_LINES) return { error: `An adjustment can have at most ${MAX_ADJ_LINES} lines` }
    lines = []
    for (let i = 0; i < b.lines.length; i++) {
      const l = pick(b.lines[i], ADJ_LINE_FIELDS)
      if (!l) return { error: `Line ${i + 1} is invalid` }
      if (typeof l.product_id !== 'string' || !UUID_RE.test(l.product_id)) return { error: `Line ${i + 1}: choose a product` }
      if (!isNum(l.quantity_before) || !isNum(l.quantity_after)) return { error: `Line ${i + 1}: quantities must be numbers` }
      if ((l.quantity_after as number) < 0 || (l.quantity_before as number) < 0) return { error: `Line ${i + 1}: quantities cannot be negative` }
      l.sort_order = i
      lines.push(l)
    }
  }
  return { header, lines }
}

/** Checks the location and every product belong to this organisation. Returns an error message or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkOwnership(db: any, orgId: string, header: Row, lines?: Row[]): Promise<string | null> {
  if (typeof header.location_id === 'string') {
    const { data } = await db.from('locations').select('id').eq('id', header.location_id).eq('org_id', orgId).maybeSingle()
    if (!data) return 'Location not found'
  }
  if (lines && lines.length > 0) {
    const ids = [...new Set(lines.map(l => l.product_id as string))]
    const { data } = await db.from('products').select('id').eq('org_id', orgId).in('id', ids)
    if ((data ?? []).length !== ids.length) return 'One or more products were not found'
  }
  return null
}
