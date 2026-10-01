// src/lib/pick-list/print.ts
// Browser side: fetch the pick list data, build the page and open the print dialog
// (choose "Save as PDF" there for a PDF). One page per order for "single"; one document for consolidated.

import { renderPickListHtml } from './render'
import type { PickListMode, PickListPayload } from './types'

export async function printPickList(ids: string[], mode: PickListMode): Promise<{ ok: true } | { ok: false; error: string }> {
  // Open the window straight away (inside the click) so pop-up blockers allow it, then fill it in
  const w = window.open('', '_blank')
  if (!w) return { ok: false, error: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' }
  w.document.write('<!doctype html><title>Pick list</title><body style="font-family:system-ui,sans-serif;color:#555;padding:40px">Preparing pick list…</body>')
  try {
    const res = await fetch(`/api/org/sales/pick-list?ids=${encodeURIComponent(ids.join(','))}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { w.close(); return { ok: false, error: data.error ?? 'Could not build the pick list' } }
    const html = renderPickListHtml(data as PickListPayload, { mode })
    w.document.open()
    w.document.write(html)
    w.document.close()
    return { ok: true }
  } catch {
    w.close()
    return { ok: false, error: 'Network error — please try again.' }
  }
}
