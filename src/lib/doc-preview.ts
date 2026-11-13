// src/lib/doc-preview.ts
// Settings → document templates: the preview shows the organisation's own logo, details and currency instead of made-up ones.
// Client-safe (no server imports). Mirrors how the printed documents build the business block.
import type { InvoiceBusiness } from '@/lib/invoice/types'
import type { PackBusiness } from '@/lib/packing-list/types'

export type OrgPreviewInfo = {
  name: string; tradingName?: string; address: string; phone: string; email: string
  abn: string; gst: string; country: string; logoUrl: string
}

const t = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
const addressLines = (a: string) => t(a).split(/\r?\n/).map(t).filter(Boolean)
const abnLabel = (country: string) => (/australia|^au$/i.test(country) ? 'ABN' : /new zealand|^nz$/i.test(country) || !country ? 'NZBN' : 'Business no.')

export function previewInvoiceBusiness(o: OrgPreviewInfo, sample: InvoiceBusiness): InvoiceBusiness {
  const name = t(o.tradingName) || t(o.name)
  if (!name) return sample
  return {
    name,
    logo_url: t(o.logoUrl) || null,
    address: addressLines(o.address),
    phone: t(o.phone) || null,
    email: t(o.email) || null,
    numbers: [t(o.gst) ? `Tax no. ${t(o.gst)}` : '', t(o.abn) ? `${abnLabel(t(o.country))} ${t(o.abn)}` : ''].filter(Boolean),
  }
}

export function previewPackBusiness(o: OrgPreviewInfo, sample: PackBusiness): PackBusiness {
  const name = t(o.tradingName) || t(o.name)
  if (!name) return sample
  return {
    name,
    logo_url: t(o.logoUrl) || null,
    address: addressLines(o.address),
    phone: t(o.phone) || null,
    email: t(o.email) || null,
    tax_number: [t(o.abn) ? `NZBN/ABN ${t(o.abn)}` : '', t(o.gst) ? `GST ${t(o.gst)}` : ''].filter(Boolean).join(' · ') || null,
  }
}

export type DocPreviewOrg = OrgPreviewInfo & { currency: string; timezone: string; decimals: number }

/** The sample orders, priced in the organisation's own currency. */
export const inCurrency = <T extends { currency: string }>(orders: T[], currency: string): T[] =>
  currency ? orders.map(o => ({ ...o, currency })) : orders
