// @vitest-environment node
// (pdfmake needs the real Node Buffer; the default jsdom environment breaks font loading)
import { describe, expect, it } from 'vitest'
import { DEFAULT_PACKING_LIST_CONFIG, type PackingListConfig } from '@/lib/packing-list/config'
import type { PackOrder, PackRow, PackingListPayload } from '@/lib/packing-list/types'
import { DEFAULT_PICK_LIST_CONFIG, type PickListConfig } from '@/lib/pick-list/config'
import type { PickOrder, PickRow, PickListPayload } from '@/lib/pick-list/types'
import { renderPackingListPdf } from '@/lib/pdf/packing-list'
import { renderPickListPdf } from '@/lib/pdf/pick-list'

const offAll = <T extends Record<string, Record<string, boolean>>>(cfg: T): T =>
  Object.fromEntries(Object.entries(cfg).map(([g, v]) => [g, Object.fromEntries(Object.keys(v).map(k => [k, false]))])) as T

const pageCount = (buf: Buffer) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length

// ── packing list samples ──
const prow = (n: number, extra: Partial<PackRow> = {}): PackRow => ({
  line_id: String(n), name: `Merino Crew Sock, Charcoal (M) ${n}`, sku: `SOC-${n}`, note: 'Handle with care', unit: 'Each',
  ordered: 10, shipped: 8, backorder: 2, batch: `B24${n}`, expiry: '2027-03-14', serials: ['TP28-10418', 'TP28-10419'], ...extra,
})
const packOrder = (rows: PackRow[], extra: Partial<PackOrder> = {}): PackOrder => ({
  id: 'a', so_number: 'SO-0005', order_date: '2026-09-28', ship_date: '2026-10-02', ship_by: '2026-10-03', customer_ref: 'PO-88213',
  ship_from: { name: 'Auckland Warehouse', lines: ['Unit 3, 22 Constellation Drive', 'Rosedale, Auckland 0632'], phone: '09 555 0198' },
  ship_to: { name: 'Summit Gear Co.', lines: ['118 Colombo Street', 'Christchurch 8023'], phone: '03 555 0177' },
  carrier: 'NZ Post', service: 'Courier · Overnight', tracking: 'NZ4829175530', packages: 2,
  notes: 'Please deliver to the loading dock at the rear.', rows, ...extra,
})
const packPayload = (order: PackOrder, config: PackingListConfig = DEFAULT_PACKING_LIST_CONFIG): PackingListPayload => ({
  orders: [order], config, timezone: 'Pacific/Auckland',
  business: { name: 'Your Business Ltd', logo_url: null, address: ['14 Wairau Road, Glenfield, Auckland 0627'], phone: '09 555 0142', email: 'orders@yourbusiness.example', tax_number: 'NZBN 9429 0000 0000 0' },
})

describe('renderPackingListPdf', () => {
  const rows = [prow(1), prow(2, { serials: [], batch: null }), prow(2, { continued: true, ordered: null, backorder: null, batch: 'B999' })]

  it('makes a valid PDF with the right file name', async () => {
    const { filename, buffer } = await renderPackingListPdf(packPayload(packOrder(rows)))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(2048)
    expect(filename).toBe('Packing-List-SO-0005.pdf')
  })

  it('sanitises the file name', async () => {
    const { filename } = await renderPackingListPdf(packPayload(packOrder(rows, { so_number: 'SO/12 3' })))
    expect(filename).toBe('Packing-List-SO_12_3.pdf')
  })

  it('works with every toggle switched off', async () => {
    const { buffer } = await renderPackingListPdf(packPayload(packOrder(rows), offAll(DEFAULT_PACKING_LIST_CONFIG)))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(2048)
  })

  it('works with each toggle switched off on its own', async () => {
    for (const [g, v] of Object.entries(DEFAULT_PACKING_LIST_CONFIG)) {
      for (const k of Object.keys(v)) {
        const cfg = structuredClone(DEFAULT_PACKING_LIST_CONFIG) as unknown as Record<string, Record<string, boolean>>
        cfg[g][k] = false
        const { buffer } = await renderPackingListPdf(packPayload(packOrder(rows), cfg as unknown as PackingListConfig))
        expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
      }
    }
  })

  it('runs onto more than one page with a long list', async () => {
    const many = Array.from({ length: 60 }, (_, i) => prow(i + 1))
    const { buffer } = await renderPackingListPdf(packPayload(packOrder(many)))
    expect(pageCount(buffer)).toBeGreaterThan(1)
  })

  it('works with empty optional fields', async () => {
    const empty = packOrder([prow(1, { batch: null, expiry: null, serials: [], note: null, sku: '', ordered: null, backorder: null })], {
      order_date: null, ship_date: null, ship_by: null, customer_ref: null, ship_from: null, ship_to: null,
      carrier: '', service: '', tracking: '', packages: null, notes: null,
    })
    const { buffer } = await renderPackingListPdf(packPayload(empty))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(2048)
  })

  it('copes with no rows, long unbroken values and a bad time zone', async () => {
    const long = prow(1, { name: 'X'.repeat(120), batch: 'B'.repeat(40), serials: ['S'.repeat(60)] })
    const o = packOrder([long], { tracking: 'T'.repeat(80) })
    expect((await renderPackingListPdf({ ...packPayload(o), timezone: 'Not/AZone' })).buffer.length).toBeGreaterThan(2048)
    expect((await renderPackingListPdf(packPayload(packOrder([])))).buffer.length).toBeGreaterThan(2048)
  })

  it('rejects an order index that does not exist', async () => {
    await expect(renderPackingListPdf(packPayload(packOrder(rows)), 3)).rejects.toThrow()
  })
})

// ── pick list samples ──
const krow = (n: number, extra: Partial<PickRow> = {}): PickRow => ({
  line_id: String(n), product_id: `P${n}`, name: `Stainless Steel Water Bottle 750ml ${n}`, sku: `WB-${n}`, note: 'Keep in retail boxes', unit: 'Each',
  qty: 4, bin: `A-0${(n % 9) + 1}-2`, batch: 'B-2210', expiry: '2027-03-14', serial: null, serialSlots: 0, ...extra,
})
const pickOrder = (rows: PickRow[], extra: Partial<PickOrder> = {}): PickOrder => ({
  id: 'b', so_number: 'SO-0005', customer: 'Centimia', ship_by: '2026-10-03', note: 'Deliver to the loading dock, ask for Aroha.',
  location: 'Main Warehouse', needsSerials: true, rows, ...extra,
})
const pickPayload = (order: PickOrder, config: PickListConfig = DEFAULT_PICK_LIST_CONFIG): PickListPayload => ({ orders: [order], config, timezone: 'Pacific/Auckland' })

describe('renderPickListPdf', () => {
  const rows = [
    krow(1), krow(2, { serialSlots: 3, batch: null, expiry: null }), krow(3, { serial: 'SN-1234' }),
    krow(4, { noStock: true, bin: null, qty: 2 }), krow(5, { unit: 'Roll' }),
  ]

  it('makes a valid PDF with the right file name', async () => {
    const { filename, buffer } = await renderPickListPdf(pickPayload(pickOrder(rows)))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(2048)
    expect(filename).toBe('Pick-List-SO-0005.pdf')
  })

  it('works with every toggle switched off', async () => {
    const { buffer } = await renderPickListPdf(pickPayload(pickOrder(rows), offAll(DEFAULT_PICK_LIST_CONFIG)))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(2048)
  })

  it('works with each toggle switched off on its own', async () => {
    for (const [g, v] of Object.entries(DEFAULT_PICK_LIST_CONFIG)) {
      for (const k of Object.keys(v)) {
        const cfg = structuredClone(DEFAULT_PICK_LIST_CONFIG) as unknown as Record<string, Record<string, boolean>>
        cfg[g][k] = false
        const { buffer } = await renderPickListPdf(pickPayload(pickOrder(rows), cfg as unknown as PickListConfig))
        expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
      }
    }
  })

  it('runs onto more than one page with a long list', async () => {
    const many = Array.from({ length: 60 }, (_, i) => krow(i + 1, i % 7 === 0 ? { serialSlots: 2 } : {}))
    const { buffer } = await renderPickListPdf(pickPayload(pickOrder(many)))
    expect(pageCount(buffer)).toBeGreaterThan(1)
  })

  it('works with empty optional fields', async () => {
    const empty = pickOrder([krow(1, { batch: null, expiry: null, bin: null, note: null, sku: '' })], { ship_by: null, note: null, customer: '', location: '' })
    const { buffer } = await renderPickListPdf(pickPayload(empty))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(2048)
  })

  it('copes with no rows, a very long barcode value and a bad time zone', async () => {
    const o = pickOrder([], { so_number: 'SO-' + '9'.repeat(30) })
    expect((await renderPickListPdf({ ...pickPayload(o), timezone: 'Not/AZone' })).buffer.length).toBeGreaterThan(2048)
  })

  it('rejects an order index that does not exist', async () => {
    await expect(renderPickListPdf(pickPayload(pickOrder(rows)), 2)).rejects.toThrow()
  })
})
