// src/lib/kits/bom.ts
// Bill of Materials rules that don't need the database: reading a BOM from a request, cost and guide totals.
//   • A kit's cost is the sum of (component cost × quantity). It is calculated, never typed in.
//   • A line's guide price is only an indicative figure (default: the component's current selling price). It never feeds order totals or reports.
export type BomLineInput = { component_id: string; quantity: number; guide_price: number | null }
export const MAX_BOM_LINES = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)

/** The cost to use for a product: average, then last purchase, then cost price. */
export function productCost(p: { avg_cost?: unknown; last_cost?: unknown; cost_price?: unknown }): number {
  for (const v of [p.avg_cost, p.last_cost, p.cost_price]) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n }
  return 0
}

/** Checks the lines sent by a screen or import. Returns plain-language problems. */
export function parseBomLines(raw: unknown): { ok: true; lines: BomLineInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'The list of items is missing.' }
  if (raw.length > MAX_BOM_LINES) return { ok: false, error: `A kit can have up to ${MAX_BOM_LINES} items.` }
  const seen = new Set<string>()
  const lines: BomLineInput[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown> | null
    const row = `Item ${i + 1}`
    const id = typeof r?.component_id === 'string' ? r.component_id : ''
    if (!UUID.test(id)) return { ok: false, error: `${row}: choose an item.` }
    if (seen.has(id)) return { ok: false, error: `${row}: this item is already in the list. Add the quantity to the existing line instead.` }
    seen.add(id)
    const q = num(r?.quantity)
    if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) return { ok: false, error: `${row}: enter a quantity greater than zero.` }
    let gp: number | null = null
    if (r?.guide_price !== null && r?.guide_price !== undefined && r?.guide_price !== '') {
      gp = num(r.guide_price)
      if (!Number.isFinite(gp) || gp < 0 || gp > 1e9) return { ok: false, error: `${row}: the price can’t be negative.` }
      gp = Math.round(gp * 10000) / 10000
    }
    lines.push({ component_id: id, quantity: Math.round(q * 10000) / 10000, guide_price: gp })
  }
  return { ok: true, lines }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** Kit cost = Σ component cost × quantity */
export const kitCost = (lines: { quantity: number; cost: number }[]) => r2(lines.reduce((t, l) => t + l.quantity * l.cost, 0))
/** Indicative total of the guide prices (a line with no override uses the component's current selling price) */
export const guideTotal = (lines: { quantity: number; guide_price: number | null; sell_price: number }[]) =>
  r2(lines.reduce((t, l) => t + l.quantity * (l.guide_price ?? l.sell_price), 0))
