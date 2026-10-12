// src/lib/qty.ts
// How stock quantities are shown. Settings → Products → "Allow Decimal Quantities":
//   on  → every stock quantity shows its decimals (1 → 1.00, with the places chosen in Settings)
//   off → whole numbers only (1)
// Serial-tracked products are always whole numbers. Safe to import from client and server code.

export type QtyFmt = { decimals: boolean; places: number }
export const WHOLE_QTY: QtyFmt = { decimals: false, places: 0 }

export function qtyFmtFromOrg(org: { decimal_qty?: unknown; decimal_qty_places?: unknown } | null | undefined): QtyFmt {
  if (!org?.decimal_qty) return WHOLE_QTY
  const p = Math.floor(Number(org.decimal_qty_places))
  return { decimals: true, places: Number.isFinite(p) ? Math.min(4, Math.max(1, p)) : 2 }
}

/** Places to show: 0 for whole-number mode (or serial products), otherwise the chosen places. */
export const qtyPlaces = (f: QtyFmt, wholeOnly = false) => (f.decimals && !wholeOnly ? f.places : 0)

/** Display text for a quantity. Thousands separators included. */
export function fmtQty(n: number | string | null | undefined, f: QtyFmt, wholeOnly = false): string {
  const v = Number(n)
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return ''
  const p = qtyPlaces(f, wholeOnly)
  // Whole-number mode still shows a fraction rather than hiding stock that exists (old data), up to 4 places.
  if (p === 0 && !Number.isInteger(v)) return v.toLocaleString('en-NZ', { maximumFractionDigits: 4 })
  return v.toLocaleString('en-NZ', { minimumFractionDigits: p, maximumFractionDigits: p })
}

/** Same as fmtQty but with no thousands separator — for CSV / spreadsheet exports. */
export function fmtQtyPlain(n: number | string | null | undefined, f: QtyFmt, wholeOnly = false): string {
  const v = Number(n)
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return ''
  const p = qtyPlaces(f, wholeOnly)
  return p === 0 && !Number.isInteger(v) ? String(Number(v.toFixed(4))) : v.toFixed(p)
}

/** Round a typed quantity to what the settings allow. */
export function roundQty(n: number, f: QtyFmt, wholeOnly = false): number {
  const p = qtyPlaces(f, wholeOnly)
  return Number(n.toFixed(p))
}

/** HTML `step` for a quantity input. */
export const qtyStep = (f: QtyFmt, wholeOnly = false) => {
  const p = qtyPlaces(f, wholeOnly)
  return p === 0 ? 1 : Number((1 / 10 ** p).toFixed(p))
}

export const hasFraction = (n: number | string | null | undefined) => {
  const v = Number(n)
  return Number.isFinite(v) && Math.abs(v - Math.round(v)) > 1e-9
}

// ── Printed documents (pick list, packing list, invoice, purchase order) ──
// The document builders are synchronous, so a module-level format set at the start of a build is safe.
let DOC: QtyFmt = WHOLE_QTY
export const setDocQty = (f?: QtyFmt | null) => { DOC = f ?? WHOLE_QTY }
/** A quantity on a printed document. */
export const docQty = (n: number) => fmtQty(n, DOC)
/** A plain number (discount %, tax rate) — never uses the quantity decimals. */
export const docNum = (n: number) => String(Math.round(n * 1000) / 1000)
