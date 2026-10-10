// src/lib/pdf/packing-list.ts
// Packing list as a real PDF (pdfmake), mirroring src/lib/packing-list/render.ts: A4 portrait, black and white,
// every toggle in PackingListConfig honoured. One order per PDF.
import type { Content, ContentTable, TableCell } from 'pdfmake/interfaces'
import { code128Widths } from '@/lib/pick-list/barcode'
import type { PackingListConfig } from '@/lib/packing-list/config'
import type { PackAddress, PackBusiness, PackOrder, PackRow, PackingListPayload } from '@/lib/packing-list/types'
import { buildPdf, fmtDate, loadLogo, logoContent, lbl, pageFooter, qtyText, safeName } from './engine'

const INK = '#000000'
const MUT = '#4B5563'
const LINE = '#9CA3AF'
const SHADE = '#F3F4F6'
const CONTENT_W = 595.28 - 68 // A4 minus the engine's 34pt side margins
const DASH = '—'

const fmtExpiry = (d: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''
}

function stamp(tz: string, now = new Date()) {
  let zone = tz
  try { new Intl.DateTimeFormat('en-NZ', { timeZone: zone }) } catch { zone = 'UTC' }
  const printed = new Intl.DateTimeFormat('en-NZ', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(now).replace(/[  ]/g, ' ')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return { printed, today }
}

/** Code 128 bars as pdfmake canvas rectangles (quiet zone trimmed; the page margin provides it). */
function barcodeContent(text: string, maxW: number, h: number): Content {
  const widths = code128Widths(text)
  const total = widths.reduce((a, b) => a + b, 0)
  const unit = Math.min(maxW / total, 2)
  const rects: object[] = []
  let x = 0
  widths.forEach((m, i) => {
    if (i % 2 === 0) rects.push({ type: 'rect', x: x * unit, y: 0, w: m * unit, h, color: INK })
    x += m
  })
  return { canvas: rects, margin: [maxW - total * unit, 6, 0, 0] } as Content
}

/** A one-row bordered strip whose cells share vertical dividers (like the meta/ship/stat boxes in the HTML). */
function strip(cells: Content[], widths: (number | string)[], fill?: string): Content {
  return {
    table: { widths, body: [cells.map(c => ({ ...(c as object), fillColor: fill }) as TableCell)] },
    layout: {
      hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => INK,
      vLineColor: (i: number, node: ContentTable) => (i === 0 || i === node.table.widths!.length ? INK : LINE),
      paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 8],
  } as Content
}

const labelled = (label: string, value: Content): Content => ({ stack: [lbl(label, { color: MUT }), value] }) as Content
const valueText = (v: string, extra: object = {}): Content => ({ text: v || DASH, fontSize: 9.5, bold: true, ...extra }) as Content

function addrCell(label: string, a: PackAddress | null): Content {
  const stack: Content[] = [lbl(label, { color: MUT })]
  if (!a) {
    stack.push({ text: DASH, bold: true, fontSize: 10.5 } as Content)
  } else {
    stack.push({ text: a.name || DASH, bold: true, fontSize: 10.5, margin: [0, 0, 0, 2] } as Content)
    if (a.lines.length) stack.push({ text: a.lines.join('\n'), fontSize: 9 } as Content)
    if (a.phone) stack.push({ text: `Phone: ${a.phone}`, color: MUT, fontSize: 8.5, margin: [0, 4, 0, 0] } as Content)
  }
  return { stack, minHeight: 50 } as Content
}

function mast(o: PackOrder, biz: PackBusiness, cfg: PackingListConfig, logo: Content | null): Content {
  const h = cfg.header
  const contact = [biz.address.join(', '), [biz.phone, biz.email].filter(Boolean).join(' · '), biz.tax_number].filter(Boolean) as string[]
  const left: Content[] = []
  if (h.logo && logo) left.push(logo)
  if (h.businessDetails && biz.name) left.push({ text: biz.name, bold: true, fontSize: 13, margin: [0, 0, 0, 2] } as Content)
  if (h.businessDetails && contact.length) left.push({ text: contact.join('\n'), fontSize: 8.5, color: MUT, lineHeight: 1.35 } as Content)
  const right: Content[] = [
    { text: 'Packing List', bold: true, fontSize: 22, alignment: 'right' } as Content,
    { text: o.so_number, bold: true, fontSize: 14, alignment: 'right', margin: [0, 4, 0, 0] } as Content,
  ]
  if (h.barcode && o.so_number) right.push(barcodeContent(o.so_number, 220, 34))
  return {
    stack: [
      { columns: [{ width: '*', stack: left }, { width: 230, stack: right }], columnGap: 16 },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 2.5, lineColor: INK }], margin: [0, 8, 0, 10] },
    ],
  } as Content
}

type ColKey = 'batch' | 'serial' | 'expiry' | 'ordered'
const COL_DEFS: { key: ColKey; label: string; w: number; right?: boolean }[] = [
  { key: 'batch', label: 'Batch', w: 60 },
  { key: 'serial', label: 'Serial', w: 84 },
  { key: 'expiry', label: 'Expiry', w: 46 },
  { key: 'ordered', label: 'Ordered', w: 46, right: true },
]

function itemsTable(rows: PackRow[], cfg: PackingListConfig): Content {
  const cols = COL_DEFS.filter(c => cfg.columns[c.key])
  const th = (text: string, right = false): TableCell => ({ text: text.toUpperCase(), fontSize: 6.5, bold: true, color: MUT, characterSpacing: 0.6, alignment: right ? 'right' : 'left' })
  const header: TableCell[] = [th('#'), th('Product'), ...cols.map(c => th(c.label, c.right)), th('Shipped', true), ...(cfg.columns.backorder ? [th('Back-order', true)] : [])]
  const widths: (number | string)[] = [18, '*', ...cols.map(c => c.w), 46, ...(cfg.columns.backorder ? [54] : [])]
  const na = (): TableCell => ({ text: DASH, color: LINE })

  const body: TableCell[][] = [header]
  const continuedAt: boolean[] = [false] // per table row index (header = false)
  let n = 0
  rows.forEach(r => {
    const cell = (k: ColKey): TableCell => {
      switch (k) {
        case 'batch': return r.batch ? { text: r.batch, bold: true } : na()
        case 'serial': return r.serials.length ? { stack: r.serials.map(s => ({ text: s, bold: true })) } : na()
        case 'expiry': return fmtExpiry(r.expiry) ? { text: fmtExpiry(r.expiry), bold: true } : na()
        case 'ordered': return { text: r.ordered === null ? '' : qtyText(r.ordered), alignment: 'right', bold: true }
      }
    }
    const prod: TableCell = r.continued
      ? { text: '' }
      : {
          stack: [
            { text: r.name, bold: true, fontSize: 9.5 },
            ...(r.sku ? [{ text: r.sku, color: MUT, fontSize: 8 }] : []),
            ...(cfg.columns.notes && r.note ? [{ text: r.note, italics: true, color: MUT, fontSize: 8, margin: [0, 2, 0, 0] }] : []),
          ] as Content[],
        }
    const bo: TableCell[] = cfg.columns.backorder
      ? [{ text: r.backorder === null ? '' : r.backorder ? qtyText(r.backorder) : DASH, alignment: 'right', bold: !!r.backorder }]
      : []
    body.push([
      { text: r.continued ? '' : String(++n), color: MUT, fontSize: 8 },
      prod,
      ...cols.map(c => cell(c.key)),
      { text: qtyText(r.shipped), alignment: 'right', bold: true, fontSize: 10.5 },
      ...bo,
    ])
    continuedAt.push(!!r.continued)
  })
  if (!rows.length) {
    body.push([{ text: 'No items', colSpan: widths.length, color: MUT, italics: true, margin: [0, 4, 0, 4] } as TableCell, ...widths.slice(1).map(() => ({}) as TableCell)])
    continuedAt.push(false)
  }
  return {
    table: { headerRows: 1, dontBreakRows: true, widths, body },
    layout: {
      // line i sits above table row i: no rule between a line and its continuation rows
      hLineWidth: (i: number, node: ContentTable) => (i === 0 ? 0 : i === 1 ? 1.5 : i === node.table.body.length ? 0.75 : continuedAt[i] ? 0 : 0.5),
      hLineColor: (i: number) => (i === 1 ? INK : LINE),
      vLineWidth: () => 0,
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4,
    },
  } as Content
}

function statsContent(o: PackOrder, cfg: PackingListConfig): Content | null {
  const lines = new Set(o.rows.map(r => r.line_id)).size
  const units = o.rows.reduce((s, r) => s + r.shipped, 0)
  const backordered = o.rows.reduce((s, r) => s + (r.backorder ?? 0), 0)
  const cells = [
    cfg.stats.lines ? { label: 'Lines', value: String(lines) } : null,
    cfg.stats.units ? { label: 'Units shipped', value: qtyText(units) } : null,
    cfg.stats.backordered ? { label: 'Back-ordered', value: qtyText(backordered) } : null,
    cfg.stats.packages ? { label: 'Packages', value: o.packages ? String(o.packages) : DASH } : null,
  ].filter((x): x is { label: string; value: string } => !!x)
  if (!cells.length) return null
  return strip(cells.map(c => labelled(c.label, { text: c.value, bold: true, fontSize: 15 } as Content)), cells.map(() => '*'))
}

function signContent(cfg: PackingListConfig): Content | null {
  const items = [cfg.footer.packedBy ? 'Packed by' : '', cfg.footer.receivedBy ? 'Received by' : ''].filter(Boolean)
  if (!items.length) return null
  const w = (CONTENT_W - 28 * (items.length - 1)) / items.length
  return {
    columns: items.map(i => ({
      width: w,
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 1, lineColor: INK }] },
        { columns: [{ text: i.toUpperCase(), width: '*' }, { text: 'DATE', width: 'auto' }], fontSize: 6.5, bold: true, color: MUT, characterSpacing: 0.8, margin: [0, 3, 0, 0] },
      ],
    })),
    columnGap: 28,
    margin: [0, 28, 0, 0],
  } as Content
}

export async function renderPackingListPdf(payload: PackingListPayload, orderIndex = 0): Promise<{ filename: string; buffer: Buffer }> {
  const o = payload.orders[orderIndex]
  if (!o) throw new Error(`Packing list: no order at index ${orderIndex}`)
  const cfg = payload.config
  const biz = payload.business
  const { printed, today } = stamp(payload.timezone)
  const logo = cfg.header.logo ? logoContent(await loadLogo(biz.logo_url), 160, 46) : null

  const content: Content[] = [mast(o, biz, cfg, logo)]

  const meta: { label: string; value: string }[] = [
    ...(cfg.meta.orderDate ? [{ label: 'Order date', value: fmtDate(o.order_date) }] : []),
    ...(cfg.meta.shipDate ? [{ label: 'Ship date', value: fmtDate(o.ship_date ?? today) }] : []),
    ...(cfg.meta.customerRef ? [{ label: 'Customer order #', value: o.customer_ref ?? '' }] : []),
    ...(cfg.meta.shipBy ? [{ label: 'Ship by', value: fmtDate(o.ship_by) }] : []),
  ]
  if (meta.length) content.push(strip(meta.map(c => labelled(c.label, valueText(c.value))), meta.map(() => '*')))

  const boxes = [cfg.addresses.shipFrom ? addrCell('Ship from', o.ship_from) : null, cfg.addresses.shipTo ? addrCell('Ship to', o.ship_to) : null].filter((x): x is Content => !!x)
  if (boxes.length) content.push(strip(boxes, boxes.map(() => '*')))

  const s = cfg.shipping
  const ship = [
    s.carrier ? { label: 'Carrier', value: o.carrier, w: 1.1, bold: false } : null,
    s.service ? { label: 'Service', value: o.service, w: 1.5, bold: false } : null,
    s.tracking ? { label: 'Tracking number', value: o.tracking, w: 1.8, bold: true } : null,
    s.packages ? { label: 'Packages', value: o.packages ? String(o.packages) : '', w: 0.8, bold: false } : null,
  ].filter((x): x is { label: string; value: string; w: number; bold: boolean } => !!x)
  if (ship.length) {
    const total = ship.reduce((a, c) => a + c.w, 0)
    // strip padding is 16pt per cell and the borders 1pt each, so fixed widths are sized from what is left
    const avail = CONTENT_W - ship.length * 16 - (ship.length + 1)
    content.push(strip(ship.map(c => labelled(c.label, valueText(c.value, { bold: true }))), ship.map(c => Math.floor((avail * c.w) / total)), SHADE))
  }

  content.push(itemsTable(o.rows, cfg))

  const tail: Content[] = []
  const stats = statsContent(o, cfg)
  if (stats) tail.push(stats)
  if (cfg.footer.deliveryNotes && o.notes) {
    tail.push({
      table: { widths: ['*'], body: [[{ stack: [lbl('Delivery notes', { color: MUT }), { text: o.notes, fontSize: 9 }] }]] },
      layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => INK, vLineColor: () => INK, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 6 },
      margin: [0, 0, 0, 8],
    } as Content)
  }
  const sign = signContent(cfg)
  if (sign) tail.push(sign)
  // totals, notes and signatures stay together, so a signature line is never left alone on a page
  if (tail.length) content.push({ stack: tail, unbreakable: true, margin: [0, 12, 0, 0] } as Content)

  const buffer = await buildPdf({
    info: { title: `Packing List ${o.so_number}` },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK, lineHeight: 1.25 },
    footer: pageFooter(`Printed ${printed}`),
    content,
  })
  return { filename: `Packing-List-${safeName(o.so_number)}.pdf`, buffer }
}
