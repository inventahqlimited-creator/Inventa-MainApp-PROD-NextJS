// src/lib/pdf/pick-list.ts
// Pick list as a real PDF (pdfmake), mirroring the single-order layout of src/lib/pick-list/render.ts: A4 portrait,
// black and white, every toggle in PickListConfig honoured. One order per PDF.
import type { Content, ContentTable, TableCell } from 'pdfmake/interfaces'
import { code128Widths } from '@/lib/pick-list/barcode'
import type { PickListConfig } from '@/lib/pick-list/config'
import type { PickListPayload, PickOrder, PickRow } from '@/lib/pick-list/types'
import { buildPdf, fmtDate, lbl, pageFooter, qtyText, safeName } from './engine'

const INK = '#000000'
const MUT = '#4B5563'
const LINE = '#9CA3AF'
const SHADE = '#F3F4F6'
const CONTENT_W = 595.28 - 68
const DASH = '—'
const MAX_SLOTS = 30

const fmtExpiry = (d: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''
}
const unitLabel = (u: string) => (/^each$/i.test(u) ? 'ea' : u.toLowerCase())

function printedStamp(tz: string, now = new Date()) {
  let zone = tz
  try { new Intl.DateTimeFormat('en-NZ', { timeZone: zone }) } catch { zone = 'UTC' }
  return new Intl.DateTimeFormat('en-NZ', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(now).replace(/[  ]/g, ' ')
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

function strip(cells: Content[], fill?: string): Content {
  return {
    table: { widths: cells.map(() => '*'), body: [cells.map(c => ({ ...(c as object), fillColor: fill }) as TableCell)] },
    layout: {
      hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => LINE,
      vLineColor: () => LINE,
      paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 8],
  } as Content
}
const labelled = (label: string, value: Content): Content => ({ stack: [lbl(label, { color: MUT }), value] }) as Content

type ColKey = 'notes' | 'bin' | 'batch' | 'serial' | 'expiry'
const COL_DEFS: { key: ColKey; label: string; w: number }[] = [
  { key: 'notes', label: 'Notes', w: 84 },
  { key: 'bin', label: 'Bin', w: 50 },
  { key: 'batch', label: 'Batch', w: 54 },
  { key: 'serial', label: 'Serial', w: 66 },
  { key: 'expiry', label: 'Expiry', w: 46 },
]

const tick = (): Content => ({ canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, r: 2, lineWidth: 1.3, lineColor: INK }], margin: [0, 1, 0, 0] }) as Content
const na = (): TableCell => ({ text: DASH, color: LINE, alignment: 'center' })
const mono = (v: string | null | undefined): TableCell => (v ? { text: v, bold: true, alignment: 'center' } : na())

function cellFor(key: ColKey, r: PickRow, w: number): TableCell {
  switch (key) {
    case 'notes': {
      const bits: object[] = []
      if (r.noStock) bits.push({ text: 'No stock', bold: true, italics: false })
      if (r.note) bits.push({ text: `${r.noStock ? ' · ' : ''}${r.note}`, italics: true })
      return { text: bits as never, fontSize: 8.5 }
    }
    case 'bin': return r.bin ? { text: r.bin, bold: true, alignment: 'center' } : na()
    case 'batch': return mono(r.batch)
    case 'serial': {
      if (r.serial) return mono(r.serial)
      const slots = Math.min(r.serialSlots, MAX_SLOTS)
      if (slots > 0) {
        const lw = w - 8
        return { canvas: Array.from({ length: slots }, (_, i) => ({ type: 'line', x1: 0, y1: 11 + i * 14, x2: lw, y2: 11 + i * 14, lineWidth: 1, lineColor: INK })), margin: [0, 0, 0, 0] } as TableCell
      }
      return na()
    }
    case 'expiry': return fmtExpiry(r.expiry) ? mono(fmtExpiry(r.expiry)) : na()
  }
}

function itemsTable(o: PickOrder, cfg: PickListConfig): Content {
  const cols = COL_DEFS.filter(c => cfg.columns[c.key])
  const th = (text: string, align: 'left' | 'center' | 'right' = 'left'): TableCell => ({ text: text.toUpperCase(), fontSize: 6.5, bold: true, color: MUT, characterSpacing: 0.6, alignment: align })
  const header: TableCell[] = [th(''), th('Product'), ...cols.map(c => th(c.label, c.key === 'notes' ? 'left' : 'center')), th('Qty', 'right')]
  const widths: (number | string)[] = [14, '*', ...cols.map(c => c.w), 44]
  const body: TableCell[][] = [header]
  o.rows.forEach(r => {
    body.push([
      tick() as TableCell,
      {
        stack: [
          { text: r.name, bold: true, fontSize: 10 },
          ...(r.sku ? [{ text: r.sku, color: MUT, fontSize: 8 }] : []),
        ] as Content[],
      },
      ...cols.map(c => cellFor(c.key, r, c.w)),
      { text: [{ text: qtyText(r.qty), bold: true, fontSize: 11 }, { text: ` ${unitLabel(r.unit)}`, fontSize: 8 }] as never, alignment: 'right' },
    ])
  })
  if (!o.rows.length) {
    body.push([{ text: 'No items', colSpan: widths.length, color: MUT, italics: true } as TableCell, ...widths.slice(1).map(() => ({}) as TableCell)])
  }
  return {
    table: { headerRows: 1, dontBreakRows: true, widths, body },
    layout: {
      hLineWidth: (i: number, node: ContentTable) => (i === 0 ? 0 : i === 1 ? 1.5 : i === node.table.body.length ? 0.75 : 0.5),
      hLineColor: (i: number) => (i === 1 ? INK : LINE),
      vLineWidth: () => 0,
      fillColor: (i: number) => (i > 0 && i % 2 === 0 ? SHADE : null),
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 5, paddingBottom: () => 5,
    },
  } as Content
}

export async function renderPickListPdf(payload: PickListPayload, orderIndex = 0): Promise<{ filename: string; buffer: Buffer }> {
  const o = payload.orders[orderIndex]
  if (!o) throw new Error(`Pick list: no order at index ${orderIndex}`)
  const cfg = payload.config
  const printed = printedStamp(payload.timezone)

  const right: Content[] = [{ text: o.so_number, bold: true, fontSize: 20, alignment: 'right' } as Content]
  if (cfg.header.barcode && o.so_number) right.push(barcodeContent(o.so_number, 220, 34))
  const content: Content[] = [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Pick List', bold: true, fontSize: 24 },
            { text: `Sales order${o.location ? ` · Ship from ${o.location}` : ''}`, bold: true, fontSize: 9, color: MUT, margin: [0, 4, 0, 0] },
          ],
        },
        { width: 230, stack: right },
      ],
      columnGap: 16,
    } as Content,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 2.5, lineColor: INK }], margin: [0, 8, 0, 10] } as Content,
  ]

  const meta = [
    ...(cfg.header.customer ? [{ label: 'Customer', value: o.customer }] : []),
    ...(cfg.header.shipBy ? [{ label: 'Ship by', value: fmtDate(o.ship_by) }] : []),
  ]
  if (meta.length) content.push(strip(meta.map(c => labelled(c.label, { text: c.value || DASH, bold: true, fontSize: 10 } as Content))))

  content.push(itemsTable(o, cfg))

  const lines = new Set(o.rows.map(r => r.line_id)).size
  const units = o.rows.filter(r => !r.noStock).reduce((s, r) => s + r.qty, 0)
  const bins = new Set(o.rows.filter(r => r.bin && !r.noStock).map(r => r.bin)).size
  const serialLines = new Set(o.rows.filter(r => r.serial || r.serialSlots > 0).map(r => r.line_id)).size
  const stats = [
    cfg.stats.lines ? { label: 'Lines', value: String(lines) } : null,
    cfg.stats.units ? { label: 'Units to pick', value: qtyText(units) } : null,
    cfg.stats.bins ? { label: 'Bins to visit', value: String(bins) } : null,
    cfg.stats.serials ? { label: 'Needs serials', value: String(serialLines) } : null,
  ].filter((x): x is { label: string; value: string } => !!x)

  const tail: Content[] = []
  if (stats.length) tail.push(strip(stats.map(s => labelled(s.label, { text: s.value, bold: true, fontSize: 16 } as Content))))
  if (cfg.footer.orderNote && o.note) {
    tail.push({
      table: { widths: ['*'], body: [[{ stack: [lbl('Order note', { color: MUT }), { text: o.note, fontSize: 9 }] }]] },
      layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => LINE, vLineColor: () => LINE, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 6 },
      margin: [0, 0, 0, 8],
    } as Content)
  }
  const signs = [cfg.footer.pickedBy ? 'Picked by' : '', cfg.footer.checkedBy ? 'Checked by' : ''].filter(Boolean)
  if (signs.length) {
    const w = (CONTENT_W - 22 * (signs.length - 1)) / signs.length
    tail.push({
      columns: signs.map(s => ({
        width: w,
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 1, lineColor: INK }] },
          { text: s.toUpperCase(), fontSize: 6.5, bold: true, color: MUT, characterSpacing: 0.8, margin: [0, 3, 0, 0] },
        ],
      })),
      columnGap: 22,
      margin: [0, 28, 0, 0],
    } as Content)
  }
  if (tail.length) content.push({ stack: tail, unbreakable: true, margin: [0, 12, 0, 0] } as Content)

  const buffer = await buildPdf({
    info: { title: `Pick List ${o.so_number}` },
    footer: pageFooter(`Printed ${printed}`),
    content,
  })
  return { filename: `Pick-List-${safeName(o.so_number)}.pdf`, buffer }
}
