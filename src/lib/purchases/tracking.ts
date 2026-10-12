// src/lib/purchases/tracking.ts
// Receiving rules for tracked products (same idea as stock adjustments): when a product is batch, expiry or
// serial tracked, the details must be filled in for whatever is being received. Checked on the server so no
// screen, import or API call can skip them.

export type ReceiveLineIn = { id: string; qty_to_receive: number; batch_num?: unknown; expiry_date?: unknown; serial_numbers?: unknown }
export type Tracking = { name: string; batch: boolean; expiry: boolean; serial: boolean }

/** First problem found, or null when every line is fine. */
export function checkReceiveTracking(lines: ReceiveLineIn[], tracking: Map<string, Tracking>): string | null {
  const seenAcross = new Map<string, Set<string>>() // product name -> serials in this receipt
  for (const l of lines) {
    const qty = Number(l.qty_to_receive) || 0
    if (qty <= 0) continue
    const t = tracking.get(l.id)
    if (!t) continue
    if (t.batch && !String(l.batch_num ?? '').trim()) return `Enter a batch number for "${t.name}".`
    if (t.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(String(l.expiry_date ?? ''))) return `Enter an expiry date for "${t.name}".`
    if (t.serial) {
      const list = Array.isArray(l.serial_numbers) ? l.serial_numbers.map(s => String(s ?? '').trim()) : []
      if (list.length === 0 || list.some(s => !s)) return `Enter a serial number for every unit of "${t.name}".`
      if (!Number.isInteger(qty) || list.length !== qty) return `"${t.name}" needs exactly ${qty} serial number${qty === 1 ? '' : 's'} (one per unit).`
      const seen = seenAcross.get(t.name) ?? new Set<string>()
      for (const s of list) {
        if (seen.has(s.toLowerCase())) return `Serial number ${s} is listed twice for "${t.name}".`
        seen.add(s.toLowerCase())
      }
      seenAcross.set(t.name, seen)
    }
  }
  return null
}

export const isTracked = (t: Tracking) => t.batch || t.expiry || t.serial
