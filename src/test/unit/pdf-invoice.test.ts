// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderInvoicePdf } from '@/lib/pdf/invoice'
import { DEFAULT_INVOICE_CONFIG } from '@/lib/invoice/config'
import { SAMPLE_INVOICES, SAMPLE_INVOICE_BUSINESS } from '@/lib/invoice/render'
import type { InvoicePayload } from '@/lib/invoice/types'

const payload = (over: Partial<InvoicePayload> = {}): InvoicePayload => ({
  orders: SAMPLE_INVOICES, business: SAMPLE_INVOICE_BUSINESS, config: DEFAULT_INVOICE_CONFIG, timezone: 'Pacific/Auckland', decimals: 2, ...over,
})
const pages = (b: Buffer) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe('invoice pdf', () => {
  it('builds an invoice with the right name', async () => {
    const r = await renderInvoicePdf(payload())
    expect(r.buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(r.buffer.length).toBeGreaterThan(2000)
    expect(r.filename).toBe('Tax-Invoice-INV-0005.pdf')
  })
  it('builds quotes and purchase orders with their own title', async () => {
    const q = await renderInvoicePdf(payload({ orders: [{ ...SAMPLE_INVOICES[0], is_quote: true, invoice_number: 'SO-0005' }] }))
    expect(q.filename).toBe('Quote-SO-0005.pdf')
    const po = await renderInvoicePdf(payload({ orders: [{ ...SAMPLE_INVOICES[0], kind: 'purchase', invoice_number: 'PO-0007', due_date: '2026-10-20' }] }))
    expect(po.filename).toBe('Purchase-Order-PO-0007.pdf')
  })
  it('works with every layout toggle off and with a bare order', async () => {
    const off = { header: { logo: false, businessDetails: false }, details: { invoiceDate: false, dueDate: false, terms: false, orderNumber: false, customerPo: false }, addresses: { billTo: false, shipTo: false }, columns: { sku: false, unitPrice: false, discount: false, tax: false }, footer: { paymentDetails: false, notes: false }, content: DEFAULT_INVOICE_CONFIG.content }
    expect((await renderInvoicePdf(payload({ config: off }))).buffer.length).toBeGreaterThan(1000)
    const bare = { ...SAMPLE_INVOICES[0], bill_to: null, ship_to: null, terms: null, customer_po: null, notes: null, costs: [], taxes: [], invoice_date: null }
    expect((await renderInvoicePdf(payload({ orders: [bare] }))).buffer.length).toBeGreaterThan(1000)
  })
  it('runs onto more pages for long orders and survives odd input', async () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({ ...SAMPLE_INVOICES[0].lines[0], name: `Item ${i} ${'long-name '.repeat(8)}`, sku: `SKU-${i}` }))
    const r = await renderInvoicePdf(payload({ orders: [{ ...SAMPLE_INVOICES[0], lines }] }))
    expect(pages(r.buffer)).toBeGreaterThan(1)
    const odd = await renderInvoicePdf(payload({ business: { ...SAMPLE_INVOICE_BUSINESS, logo_url: 'http://evil.example/x.png' } }))
    expect(odd.buffer.length).toBeGreaterThan(1000)
  })
  it('rejects a missing order', async () => {
    await expect(renderInvoicePdf(payload(), 5)).rejects.toThrow('Order not found')
  })
})
