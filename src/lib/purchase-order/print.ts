// src/lib/purchase-order/print.ts
// Browser side: fetch the purchase order data, build the page and open the print dialog
// (choose "Save as PDF" there for a PDF). One page set per order.

import { renderInvoiceHtml } from '@/lib/invoice/render'
import type { InvoicePayload } from '@/lib/invoice/types'

export async function printPurchaseOrder(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  // Open the window straight away (inside the click) so pop-up blockers allow it, then fill it in
  const w = window.open('', '_blank')
  if (!w) return { ok: false, error: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' }
  w.document.write('<!doctype html><title>Purchase Order</title><body style="font-family:system-ui,sans-serif;color:#555;padding:40px">Preparing purchase order…</body>')
  try {
    const res = await fetch(`/api/org/purchases/document?ids=${encodeURIComponent(ids.join(','))}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { w.close(); return { ok: false, error: data.error ?? 'Could not build the purchase order' } }
    const html = renderInvoiceHtml(data as InvoicePayload)
    w.document.open()
    w.document.write(html)
    w.document.close()
    return { ok: true }
  } catch {
    w.close()
    return { ok: false, error: 'Network error — please try again.' }
  }
}
