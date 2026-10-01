// src/lib/pick-list/types.ts
// The data a printed pick list is built from. Safe to import from client and server code.

import type { PickListConfig } from './config'

export type PickRow = {
  line_id: string
  product_id: string
  name: string
  sku: string
  note: string | null
  unit: string
  qty: number
  bin: string | null
  batch: string | null
  expiry: string | null // YYYY-MM-DD
  serial: string | null // a serial number already assigned to this stock
  serialSlots: number // blank write-in lines to print when the product is serial-tracked and no number is known
  noStock?: boolean // part of the line that no stock can cover
}

export type PickOrder = {
  id: string
  so_number: string
  customer: string
  ship_by: string | null // YYYY-MM-DD
  note: string | null
  location: string
  needsSerials: boolean
  rows: PickRow[]
}

export type PickListPayload = {
  orders: PickOrder[]
  config: PickListConfig
  timezone: string
}

export type PickListMode = 'single' | 'consolidated-order' | 'consolidated-product'
