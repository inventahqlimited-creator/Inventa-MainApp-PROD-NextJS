// src/lib/packing-list/types.ts
// The data a printed packing list is built from. Safe to import from client and server code.

import type { PackingListConfig } from './config'

export type PackRow = {
  line_id: string
  name: string
  sku: string
  note: string | null
  unit: string
  /** Units on the order. Only set on the first row of a line that is split over several batches. */
  ordered: number | null
  shipped: number
  /** Units still owing. Only set on the first row of a line. */
  backorder: number | null
  batch: string | null
  expiry: string | null // YYYY-MM-DD
  serials: string[]
  /** Second and later rows of a line: the product name is not repeated */
  continued?: boolean
}

export type PackAddress = { name: string; lines: string[]; phone: string | null }

export type PackOrder = {
  id: string
  so_number: string
  order_date: string | null
  ship_date: string | null
  ship_by: string | null
  customer_ref: string | null
  ship_from: PackAddress | null
  ship_to: PackAddress | null
  carrier: string
  service: string
  tracking: string
  packages: number | null
  notes: string | null
  rows: PackRow[]
}

export type PackBusiness = {
  name: string
  logo_url: string | null
  address: string[]
  phone: string | null
  email: string | null
  tax_number: string | null
}

export type PackingListPayload = {
  orders: PackOrder[]
  business: PackBusiness
  config: PackingListConfig
  timezone: string
}

/** What the Pack screen is showing right now (not yet saved), so the printout matches the screen. */
export type PackOverride = {
  carrier: string
  method: string
  service: string
  tracking: string
  cartons: { lines: { line_id: string; qty: number }[] }[]
}
export type PackOverrides = Record<string, PackOverride>
