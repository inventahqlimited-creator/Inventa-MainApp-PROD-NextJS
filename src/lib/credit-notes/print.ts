// Browser side: fetch the credit note data, build the page and open the print dialog (choose "Save as PDF" for a PDF).
import { renderInvoiceHtml } from '@/lib/invoice/render'
import type { InvoicePayload } from '@/lib/invoice/types'
import { choosePrint } from '@/lib/print-choice'

export async function printCreditNotes(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const choice = await choosePrint(ids.length === 1 ? 'Credit note' : `${ids.length} credit notes`, 'credit_note', ids)
  if (choice !== 'print') return choice
  const w = window.open('', '_blank')
  if (!w) return { ok: false, error: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' }
  w.document.write('<!doctype html><title>Credit note</title><body style="font-family:system-ui,sans-serif;color:#555;padding:40px">Preparing credit note…</body>')
  try {
    const res = await fetch(`/api/org/credit-notes/print?ids=${encodeURIComponent(ids.join(','))}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { w.close(); return { ok: false, error: data.error ?? 'Could not build the credit note' } }
    w.document.open()
    w.document.write(renderInvoiceHtml(data as InvoicePayload))
    w.document.close()
    return { ok: true }
  } catch {
    w.close()
    return { ok: false, error: 'Network error — please try again.' }
  }
}
