// src/lib/invoice/types.ts
// The data a printed invoice is built from. Safe to import from client and server code.

import type { InvoiceConfig } from './config'

export type InvoiceAddress = { name: string; lines: string[]; email: string | null }

export type InvoiceLine = {
  name: string
  sku: string
  qty: number
  unitPrice: number
  discount: number // percent
  taxRate: number // percent
  amount: number // after discount, before tax
}

export type InvoiceCost = { name: string; sub: string; taxRate: number; amount: number }

export type InvoiceTax = { label: string; rate: number; amount: number }

export type InvoiceOrder = {
  id: string
  so_number: string
  invoice_number: string
  /** A quote (order status Quote): printed as "Quote" with the order number and no payment details */
  is_quote?: boolean
  /** YYYY-MM-DD. null until the order has shipped — the day it is printed is used until then. */
  invoice_date: string | null
  terms: string | null
  customer_po: string | null
  notes: string | null
  currency: string
  bill_to: InvoiceAddress | null
  ship_to: InvoiceAddress | null
  lines: InvoiceLine[]
  costs: InvoiceCost[]
  items_subtotal: number
  costs_subtotal: number
  discount_amount: number
  subtotal: number // after discount, before tax
  taxes: InvoiceTax[]
  tax_total: number
  total: number
}

export type InvoiceBusiness = {
  name: string
  logo_url: string | null
  address: string[]
  phone: string | null
  email: string | null
  /** e.g. "Tax no. 123-456-789", "NZBN 9429000000000" */
  numbers: string[]
}

export type InvoicePayload = {
  orders: InvoiceOrder[]
  business: InvoiceBusiness
  config: InvoiceConfig
  timezone: string
  decimals: number
}
