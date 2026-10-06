// src/lib/purchases/landed-cost.ts
// Landed cost: the order's additional costs (freight, duty, handling …) are spread over the lines of the order,
// so each product's cost includes its share. Which share is set in Settings → Purchases → Landing Cost Allocation Method.
//   value    — in proportion to each line's value (quantity × unit cost, after the line discount)
//   quantity — in proportion to each line's quantity (in stock units)
// Shares are always worked out on the whole order (what was ordered), so receiving in several parts gives every part the same extra cost per unit.

export type LandedMethod = 'value' | 'quantity'

export function normalizeMethod(v: unknown): LandedMethod {
  return v === 'quantity' ? 'quantity' : 'value' // the old "weight" option is gone → value
}

export type LandedLine = { id: string; qty: number; unitCost: number; discount?: number | null; factor?: number | null }
export type LandedResult = { id: string; allocated: number; extraPerUnit: number; units: number }

export function allocateLandedCost(method: LandedMethod, extraTotal: number, lines: LandedLine[]): LandedResult[] {
  const rows = lines.map(l => {
    const factor = Number(l.factor) > 0 ? Number(l.factor) : 1
    const qty = Math.max(0, Number(l.qty) || 0)
    const value = qty * (Number(l.unitCost) || 0) * (1 - (Number(l.discount) || 0) / 100)
    return { id: l.id, units: qty * factor, value }
  })
  const extra = Number(extraTotal) > 0 ? Number(extraTotal) : 0
  const sumValue = rows.reduce((s, r) => s + r.value, 0)
  const sumUnits = rows.reduce((s, r) => s + r.units, 0)
  // value method falls back to quantity when every line is worth nothing (e.g. free samples)
  const useValue = method === 'value' && sumValue > 0
  const basisOf = (r: { units: number; value: number }) => (useValue ? r.value : r.units)
  const total = useValue ? sumValue : sumUnits
  return rows.map(r => {
    const allocated = extra > 0 && total > 0 ? (extra * basisOf(r)) / total : 0
    return { id: r.id, allocated, extraPerUnit: r.units > 0 ? allocated / r.units : 0, units: r.units }
  })
}
