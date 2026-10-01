// src/lib/packing-list/print.ts
// Browser side: fetch the packing list data, build the page and open the print dialog
// (choose "Save as PDF" there for a PDF). One page per order.

import { renderPackingListHtml } from './render'
import type { PackOverrides, PackingListPayload } from './types'

/**
 * @param ids        sales order ids
 * @param overrides  optional: what the Pack screen is showing right now (cartons, carrier, tracking) that isn't saved yet
 */
export async function printPackingList(ids: string[], overrides?: PackOverrides): Promise<{ ok: true } | { ok: false; error: string }> {
  // Open the window straight away (inside the click) so pop-up blockers allow it, then fill it in
  const w = window.open('', '_blank')
  if (!w) return { ok: false, error: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' }
  w.document.write('<!doctype html><title>Packing list</title><body style="font-family:system-ui,sans-serif;color:#555;padding:40px">Preparing packing list…</body>')
  try {
    const res = overrides
      ? await fetch('/api/org/sales/packing-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, overrides }) })
      : await fetch(`/api/org/sales/packing-list?ids=${encodeURIComponent(ids.join(','))}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { w.close(); return { ok: false, error: data.error ?? 'Could not build the packing list' } }
    const html = renderPackingListHtml(data as PackingListPayload)
    w.document.open()
    w.document.write(html)
    w.document.close()
    return { ok: true }
  } catch {
    w.close()
    return { ok: false, error: 'Network error — please try again.' }
  }
}
