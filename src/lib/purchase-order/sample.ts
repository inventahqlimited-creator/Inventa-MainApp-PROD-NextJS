// src/lib/purchase-order/sample.ts
// Sample purchase orders for the Settings preview (same sample business as the invoice preview).

import type { InvoiceOrder } from '@/lib/invoice/types'

export const SAMPLE_PURCHASE_ORDERS: InvoiceOrder[] = [{
  id: 'p1', kind: 'purchase', so_number: 'PO-0012', invoice_number: 'PO-0012', invoice_date: '2026-10-02', due_date: '2026-10-16',
  terms: 'Net 30', customer_po: 'Q-40218', notes: 'Please deliver between 8am and 3pm on weekdays.', currency: 'NZD',
  bill_to: { name: 'Alpine Textiles Ltd', lines: ['22 Industrial Drive', 'Hamilton 3200', 'New Zealand'], email: 'sales@alpinetextiles.example' },
  ship_to: { name: 'Auckland Warehouse', lines: ['14 Wairau Road, Glenfield', 'Auckland 0627', 'New Zealand', '09 555 0142'], email: null },
  lines: [
    { name: 'Merino Crew Sock, Charcoal (M)', sku: 'SOC-MER-CH-M', qty: 120, unitPrice: 9.2, discount: 0, taxRate: 15, amount: 1104 },
    { name: 'Trail Pack 28L, Olive', sku: 'PCK-TRL-28-OL', qty: 20, unitPrice: 96, discount: 5, taxRate: 15, amount: 1824 },
    { name: 'Insulated Bottle 750ml', sku: 'BTL-INS-750', qty: 60, unitPrice: 14.5, discount: 0, taxRate: 15, amount: 870 },
    { name: 'Head Torch 300 Lumen', sku: 'TRC-HD-300', qty: 40, unitPrice: 22, discount: 0, taxRate: 15, amount: 880 },
  ],
  costs: [{ name: 'Freight', sub: 'Sea freight · 1 pallet', taxRate: 15, amount: 145 }],
  items_subtotal: 4678, costs_subtotal: 145, discount_amount: 0, subtotal: 4823,
  taxes: [{ label: 'Tax 15%', rate: 15, amount: 723.45 }], tax_total: 723.45, total: 5546.45,
}]
