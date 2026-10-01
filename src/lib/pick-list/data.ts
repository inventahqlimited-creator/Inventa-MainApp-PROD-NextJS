// src/lib/pick-list/data.ts
// Server side: loads one or several sales orders and works out WHERE each line should be picked from.
// If a line already has picks saved, those stock rows are used; whatever is still short is filled from the
// remaining stock using the organisation's picking rule (FIFO / LIFO / FEFO). Stock is shared fairly between
// the orders in the batch, so two orders never get told to take the same unit.

import { loadPickData, PICK_ANY } from '@/lib/sales-pick-data'
import { normalizePickListConfig } from './config'
import type { PickListPayload, PickOrder, PickRow } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Loaded = Awaited<ReturnType<typeof loadPickData>>
type LoadedLine = Loaded['lines'][number]
type Stock = LoadedLine['stock'][number]

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function orderStock(l: LoadedLine, rule: string): Stock[] {
  const rows = [...l.stock]
  const loose = (s: Stock) => (s.parts.every(p => p.group_id === null) ? 1 : 0)
  rows.sort((a, b) => {
    if (loose(a) !== loose(b)) return loose(a) - loose(b)
    if (rule === 'FEFO') {
      const ea = a.expiry ?? '9999-12-31', eb = b.expiry ?? '9999-12-31'
      if (ea !== eb) return ea < eb ? -1 : 1
    }
    if (a.created_at === b.created_at) return 0
    const asc = a.created_at < b.created_at ? -1 : 1
    return rule === 'LIFO' ? -asc : asc
  })
  return rows
}

type Take = { stock: Stock | null; qty: number }

function plan(loaded: Loaded): Map<string, Take[]> {
  const rule = loaded.pickingRule
  const used = new Map<string, number>() // stock already given to a line in this batch: product|location|group
  const keyOf = (l: LoadedLine, g: string | null) => `${l.product_id}|${l.location_id}|${g ?? ''}`
  const stockOf = (l: LoadedLine, g: string | null) => l.stock.find(s => s.parts.some(p => p.group_id === g)) ?? null
  const out = new Map<string, Take[]>()
  const add = (line: string, stock: Stock | null, qty: number) => {
    const list = out.get(line) ?? []
    const hit = list.find(t => t.stock === stock)
    if (hit) hit.qty += qty
    else list.push({ stock, qty })
    out.set(line, list)
  }

  // 1 — picks that are already saved
  const have = new Map<string, number>()
  for (const l of loaded.lines) {
    for (const p of l.picks) {
      used.set(keyOf(l, p.group_id), (used.get(keyOf(l, p.group_id)) ?? 0) + p.qty)
      add(l.id, stockOf(l, p.group_id), p.qty)
      have.set(l.id, (have.get(l.id) ?? 0) + p.qty)
    }
  }

  // 2 — fill what is still short, in the order the orders were given
  for (const l of loaded.lines) {
    let left = Math.max(l.ordered - (have.get(l.id) ?? 0), 0)
    for (const s of orderStock(l, rule)) {
      for (const p of s.parts) {
        if (left <= 0) break
        const free = Math.max(p.available - (used.get(keyOf(l, p.group_id)) ?? 0), 0)
        const take = Math.min(left, free)
        if (take > 0) {
          used.set(keyOf(l, p.group_id), (used.get(keyOf(l, p.group_id)) ?? 0) + take)
          add(l.id, s, take)
          left -= take
        }
      }
    }
    if (left > 0) add(l.id, null, left) // not enough stock — printed as "No stock"
  }
  return out
}

export async function loadPickListPayload(db: Db, orgId: string, ids: string[]): Promise<PickListPayload> {
  const loaded = await loadPickData(db, orgId, ids, PICK_ANY)
  const orderIds = loaded.orders.map(o => o.id)
  const lineIds = loaded.lines.map(l => l.id)

  const [{ data: orderRows }, { data: lineRows }, { data: org }] = await Promise.all([
    orderIds.length ? db.from('sales_orders').select('id, expected_date, notes').eq('org_id', orgId).in('id', orderIds) : Promise.resolve({ data: [] }),
    lineIds.length ? db.from('sales_order_lines').select('id, line_notes').in('id', lineIds) : Promise.resolve({ data: [] }),
    db.from('organisations').select('timezone, pick_list_settings').eq('id', orgId).single(),
  ])
  const extra = new Map(((orderRows ?? []) as { id: string; expected_date: string | null; notes: string | null }[]).map(r => [r.id, r]))
  const lineNote = new Map(((lineRows ?? []) as { id: string; line_notes: string | null }[]).map(r => [r.id, r.line_notes]))
  const takes = plan(loaded)

  const orders: PickOrder[] = loaded.orders.map(o => {
    const rows: PickRow[] = []
    let needsSerials = false
    for (const l of loaded.lines.filter(x => x.order_id === o.id)) {
      if (l.tracking.serial) needsSerials = true
      for (const t of takes.get(l.id) ?? []) {
        const s = t.stock
        rows.push({
          line_id: l.id,
          product_id: l.product_id,
          name: l.name,
          sku: l.sku,
          note: (lineNote.get(l.id) ?? '').trim() || null,
          unit: l.unit,
          qty: t.qty,
          bin: s?.bin ?? null,
          batch: s?.batch ?? null,
          expiry: s?.expiry ?? null,
          serial: s?.serial ?? null,
          serialSlots: s && l.tracking.serial && !s.serial ? Math.min(Math.round(t.qty), 8) : 0,
          noStock: s === null ? true : undefined,
        })
      }
    }
    // walk order: by bin, empty bins last, shortfalls at the very end
    rows.sort((a, b) => Number(!!a.noStock) - Number(!!b.noStock) || (a.bin === null ? 1 : 0) - (b.bin === null ? 1 : 0) || natural.compare(a.bin ?? '', b.bin ?? '') || natural.compare(a.name, b.name))
    const e = extra.get(o.id)
    return {
      id: o.id,
      so_number: o.so_number,
      customer: o.customer_name,
      ship_by: e?.expected_date ?? null,
      note: (e?.notes ?? '').trim() || null,
      location: o.location_name,
      needsSerials,
      rows,
    }
  })

  const orgRow = (org ?? {}) as { timezone?: string | null; pick_list_settings?: unknown }
  return { orders, config: normalizePickListConfig(orgRow.pick_list_settings), timezone: orgRow.timezone || 'Pacific/Auckland' }
}
