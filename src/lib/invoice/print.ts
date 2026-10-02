// src/lib/invoice/print.ts
// Browser side: fetch the invoice data, build the page and open the print dialog
// (choose "Save as PDF" there for a PDF). One invoice per order.

import { renderInvoiceHtml } from './render'
import type { InvoicePayload } from './types'

export async function printInvoice(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  // Open the window straight away (inside the click) so pop-up blockers allow it, then fill it in
  const w = window.open('', '_blank')
  if (!w) return { ok: false, error: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' }
  w.document.write('<!doctype html><title>Invoice</title><body style="font-family:system-ui,sans-serif;color:#555;padding:40px">Preparing invoice…</body>')
  try {
    const res = await fetch(`/api/org/sales/invoice?ids=${encodeURIComponent(ids.join(','))}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { w.close(); return { ok: false, error: data.error ?? 'Could not build the invoice' } }
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
