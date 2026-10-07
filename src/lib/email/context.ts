// What the composer needs to know about an order: who it is going to, what it is called, which documents can be attached.
import { loadInvoicePayload } from '@/lib/invoice/data'
import { loadPurchaseOrderPayload } from '@/lib/purchase-order/data'
import type { DocType } from '@/lib/pdf'
import type { PermKey } from '@/lib/permissions'
import { isEmail } from './config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
export type EmailModule = 'sales' | 'purchases' | 'transfers'
export const isEmailModule = (v: unknown): v is EmailModule => v === 'sales' || v === 'purchases' || v === 'transfers'

export const MODULE_VIEW_PERM: Record<EmailModule, PermKey> = { sales: 'view_sales', purchases: 'view_purchases', transfers: 'view_transfers' }
/** Permission needed to attach each generated document (same as printing it). */
export const DOC_PERM: Record<DocType, PermKey> = { invoice: 'print_sales_invoice', packing_list: 'print_sales_pack', pick_list: 'print_sales_pick', purchase_order: 'print_purchases' }
export const MODULE_DOCS: Record<EmailModule, { type: DocType; label: string }[]> = {
  sales: [{ type: 'invoice', label: 'Invoice / quote' }, { type: 'pick_list', label: 'Pick slip' }, { type: 'packing_list', label: 'Packing list' }],
  purchases: [{ type: 'purchase_order', label: 'Purchase order' }],
  transfers: [],
}

export type EmailContext = {
  ref: string
  docLabel: string
  recipientName: string
  recipientEmail: string
  total: string
  dueDate: string
}

export async function loadEmailContext(db: Db, orgId: string, module: EmailModule, id: string): Promise<EmailContext | null> {
  if (module === 'sales') {
    const { data: o } = await db.from('sales_orders').select('id, so_number, status, customer_id, customer_name').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!o) return null
    let email = '', total = '', due = ''
    try {
      const p = await loadInvoicePayload(db, orgId, [id])
      const ord = p.orders[0]
      if (ord) { email = ord.bill_to?.email ?? ''; total = `${ord.currency} ${ord.total.toFixed(p.decimals)}`; due = ord.due_date ?? '' }
    } catch { /* the composer still works without these */ }
    if (!email && o.customer_id) {
      const { data: c } = await db.from('contacts').select('email').eq('id', o.customer_id).eq('org_id', orgId).maybeSingle()
      email = c?.email ?? ''
    }
    const quote = String(o.status).toLowerCase() === 'quote'
    return { ref: o.so_number ?? '', docLabel: quote ? 'Quote' : 'Sales order', recipientName: o.customer_name ?? '', recipientEmail: isEmail(email) ? email : '', total, dueDate: due }
  }
  if (module === 'purchases') {
    const { data: o } = await db.from('purchase_orders').select('id, po_number, supplier_id, supplier_name').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!o) return null
    let email = '', total = '', due = ''
    try {
      const p = await loadPurchaseOrderPayload(db, orgId, [id])
      const ord = p.orders[0]
      if (ord) { email = ord.bill_to?.email ?? ''; total = `${ord.currency} ${ord.total.toFixed(p.decimals)}`; due = ord.due_date ?? '' }
    } catch { /* optional */ }
    if (!email && o.supplier_id) {
      const { data: c } = await db.from('contacts').select('email').eq('id', o.supplier_id).eq('org_id', orgId).maybeSingle()
      email = c?.email ?? ''
    }
    return { ref: o.po_number ?? '', docLabel: 'Purchase order', recipientName: o.supplier_name ?? '', recipientEmail: isEmail(email) ? email : '', total, dueDate: due }
  }
  const { data: t } = await db.from('transfer_orders').select('id, tr_number, to_location_id, expected_date').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!t) return null
  let email = '', name = ''
  if (t.to_location_id) {
    const { data: l } = await db.from('locations').select('name, email').eq('id', t.to_location_id).eq('org_id', orgId).maybeSingle()
    email = l?.email ?? ''; name = l?.name ?? ''
  }
  return { ref: t.tr_number ?? '', docLabel: 'Transfer', recipientName: name, recipientEmail: isEmail(email) ? email : '', total: '', dueDate: t.expected_date ?? '' }
}
