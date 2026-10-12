// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderInvoiceHtml, SAMPLE_INVOICES, SAMPLE_INVOICE_BUSINESS } from '@/lib/invoice/render'
import { DEFAULT_INVOICE_CONFIG, normalizeInvoiceConfig } from '@/lib/invoice/config'
import { DEFAULT_PACKING_LIST_CONFIG } from '@/lib/packing-list/config'
import { renderInvoicePdf } from '@/lib/pdf/invoice'
import { uniq } from '@/lib/doc-tracking'
import type { InvoicePayload } from '@/lib/invoice/types'

const payload = (config = DEFAULT_INVOICE_CONFIG): InvoicePayload => ({ orders: SAMPLE_INVOICES, business: SAMPLE_INVOICE_BUSINESS, config, timezone: 'Pacific/Auckland', decimals: 2 })
const on = normalizeInvoiceConfig({ details: { carrier: true, shippingMethod: true, serviceType: true, trackingNumber: true }, columns: { serial: true, batch: true, expiry: true } })

describe('invoice shipping and tracking extras', () => {
  it('are off by default (invoice and packing list)', () => {
    expect(Object.values(normalizeInvoiceConfig(undefined).details).slice(5)).toEqual([false, false, false, false])
    expect([DEFAULT_INVOICE_CONFIG.columns.serial, DEFAULT_INVOICE_CONFIG.columns.batch, DEFAULT_INVOICE_CONFIG.columns.expiry]).toEqual([false, false, false])
    expect(DEFAULT_PACKING_LIST_CONFIG.shipping).toMatchObject({ carrier: false, service: false, tracking: false })
    expect(DEFAULT_PACKING_LIST_CONFIG.columns).toMatchObject({ batch: false, serial: false, expiry: false })
  })
  it('do not print until switched on', () => {
    const html = renderInvoiceHtml(payload())
    expect(html).not.toContain('NZ4829175530')
    expect(html).not.toContain('TP28-1002')
  })
  it('print the shipping details and the serial / batch / expiry columns when switched on', () => {
    const html = renderInvoiceHtml(payload(on))
    for (const t of ['Tracking number', 'NZ4829175530', 'Shipping method', 'Courier', 'Overnight', 'NZ Post', 'Serial #', 'TP28-1002', 'B2407']) expect(html).toContain(t)
  })
  it('build a PDF with everything switched on', async () => {
    const r = await renderInvoicePdf(payload(on))
    expect(r.buffer.length).toBeGreaterThan(1000)
  })
  it('lists each value once', () => {
    expect(uniq(['A', 'A ', null, 'B', ''])).toEqual(['A', 'B'])
  })
})
