// src/lib/pdf/index.ts
// One entry point for "give me this document as a PDF". Everything above (the composer, the send route) only calls this,
// so the way PDFs are produced can change without touching them.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadInvoicePayload } from '@/lib/invoice/data'
import { loadPurchaseOrderPayload } from '@/lib/purchase-order/data'
import { loadPackingListPayload } from '@/lib/packing-list/data'
import { loadPickListPayload } from '@/lib/pick-list/data'
import { renderInvoicePdf } from './invoice'
import { renderPackingListPdf } from './packing-list'
import { renderPickListPdf } from './pick-list'

export type DocType = 'invoice' | 'purchase_order' | 'packing_list' | 'pick_list'
export const DOC_TYPES: DocType[] = ['invoice', 'purchase_order', 'packing_list', 'pick_list']
export const isDocType = (v: unknown): v is DocType => typeof v === 'string' && (DOC_TYPES as string[]).includes(v)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any> | any

/** Builds one document for one order, scoped to the organisation. Throws a readable message when it can't. */
export async function renderDocumentPdf(db: Db, orgId: string, type: DocType, orderId: string): Promise<{ filename: string; buffer: Buffer }> {
  switch (type) {
    case 'invoice': {
      const p = await loadInvoicePayload(db, orgId, [orderId])
      if (!p.orders.length) throw new Error('Draft and cancelled orders can’t be invoiced.')
      return renderInvoicePdf(p)
    }
    case 'purchase_order': {
      const p = await loadPurchaseOrderPayload(db, orgId, [orderId])
      if (!p.orders.length) throw new Error('Cancelled purchase orders can’t be sent.')
      return renderInvoicePdf(p)
    }
    case 'packing_list': {
      const p = await loadPackingListPayload(db, orgId, [orderId])
      if (!p.orders.length) throw new Error('This order isn’t ready for a packing list yet.')
      return renderPackingListPdf(p)
    }
    case 'pick_list': {
      const p = await loadPickListPayload(db, orgId, [orderId])
      if (!p.orders.length) throw new Error('No pick list for this order.')
      return renderPickListPdf(p)
    }
  }
}
