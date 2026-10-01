// src/lib/pick-list/render.ts
// Turns pick list data into a print-ready HTML page (black and white, A4 portrait).
//   single               one page per order (several orders = one page each, in the same PDF)
//   consolidated-order   every order's lines, grouped under an order band
//   consolidated-product each product once with the total to pull, split by order underneath
// What is shown is controlled by PickListConfig (Settings → Sales → Sales Documents → Pick List).

import { barcodeSvg } from './barcode'
import type { PickListConfig } from './config'
import type { PickListMode, PickListPayload, PickOrder, PickRow } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtShipBy(d: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}
function fmtExpiry(d: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''
}
const unitLabel = (u: string) => (/^each$/i.test(u) ? 'ea' : u.toLowerCase())
const qtyText = (n: number) => String(Math.round(n * 1000) / 1000)

function stamp(tz: string, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-NZ', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const printed = fmt.format(now).replace(/[\u202f\u00a0]/g, ' ')
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]))
  return { printed, ref: `PL-${p.year}${p.month}${p.day}-${p.hour}${p.minute}` }
}

// ── pieces ──
const dash = '<em class="na">—</em>'
const mono = (v: string | null | undefined) => (v ? `<span class="mono">${esc(v)}</span>` : dash)
const lineCount = (rows: PickRow[]) => new Set(rows.map(r => r.line_id)).size
const unitCount = (rows: PickRow[]) => rows.filter(r => !r.noStock).reduce((s, r) => s + r.qty, 0)

type ColKey = 'notes' | 'bin' | 'batch' | 'serial' | 'expiry'
const COL_DEFS: { key: ColKey; label: string; w: number }[] = [
  { key: 'notes', label: 'Notes', w: 104 },
  { key: 'bin', label: 'Bin', w: 70 },
  { key: 'batch', label: 'Batch', w: 68 },
  { key: 'serial', label: 'Serial', w: 80 },
  { key: 'expiry', label: 'Expiry', w: 76 },
]
const activeCols = (cfg: PickListConfig) => COL_DEFS.filter(c => cfg.columns[c.key])

function thead(cfg: PickListConfig): string {
  const cols = activeCols(cfg)
  return `<thead><tr><th style="width:28px"></th><th>Product</th>${cols.map(c => `<th class="${c.key === 'notes' ? '' : 'c'}" style="width:${c.w}px">${c.label}</th>`).join('')}<th class="r" style="width:54px">Qty</th></tr></thead>`
}

function serialCell(serial: string | null, slots: number): string {
  if (serial) return `<span class="mono">${esc(serial)}</span>`
  if (slots > 0) return `<div class="serial">${'<span></span>'.repeat(slots)}</div>`
  return dash
}

function cell(key: ColKey, r: { note: string | null; noStock?: boolean; bin: string | null; batch: string | null; serial: string | null; serialSlots: number; expiry: string | null }): string {
  switch (key) {
    case 'notes': {
      const bits = [r.noStock ? '<b>No stock</b>' : '', r.note ? esc(r.note) : ''].filter(Boolean)
      return `<td class="nt">${bits.join(' · ')}</td>`
    }
    case 'bin': return `<td class="c">${r.bin ? `<span class="bin">${esc(r.bin)}</span>` : dash}</td>`
    case 'batch': return `<td class="c">${mono(r.batch)}</td>`
    case 'serial': return `<td class="c">${serialCell(r.serial, r.serialSlots)}</td>`
    case 'expiry': return `<td class="c">${mono(fmtExpiry(r.expiry))}</td>`
  }
}

function productCell(name: string, sku: string): string {
  return `<td><div class="pn">${esc(name)}</div>${sku ? `<span class="sku">${esc(sku)}</span>` : ''}</td>`
}

function rowTr(r: PickRow, cfg: PickListConfig): string {
  return `<tr><td><span class="tick"></span></td>${productCell(r.name, r.sku)}${activeCols(cfg).map(c => cell(c.key, r)).join('')}<td class="r"><span class="qty">${qtyText(r.qty)}<small>${esc(unitLabel(r.unit))}</small></span></td></tr>`
}

function header(title: string, sub: string, big: string, code: string, cfg: PickListConfig): string {
  return `<header class="mast"><h2 class="doc">${esc(title)}<small>${esc(sub)}</small></h2><div class="code"><div class="no">${esc(big)}</div>${cfg.header.barcode ? barcodeSvg(code, 320, 46) : ''}</div></header>`
}

function metaBox(cells: { label: string; value: string }[]): string {
  if (!cells.length) return ''
  return `<div class="meta" style="grid-template-columns:repeat(${cells.length},1fr)">${cells.map(c => `<div><div class="lbl">${esc(c.label)}</div><div class="val">${esc(c.value) || '—'}</div></div>`).join('')}</div>`
}

function signRow(cfg: PickListConfig): string {
  const items = [cfg.footer.pickedBy ? 'Picked by' : '', cfg.footer.checkedBy ? 'Checked by' : ''].filter(Boolean)
  if (!items.length) return ''
  return `<div class="sign" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(i => `<div>${i}</div>`).join('')}</div>`
}

const fallbackFooter = (printed: string) => `<div class="fb"><span class="pg"></span><span>Printed ${esc(printed)}</span></div>`

// ── layouts ──
function singleSheet(o: PickOrder, cfg: PickListConfig, printed: string): string {
  const meta = metaBox([
    ...(cfg.header.customer ? [{ label: 'Customer', value: o.customer }] : []),
    ...(cfg.header.shipBy ? [{ label: 'Ship by', value: fmtShipBy(o.ship_by) }] : []),
  ])
  const bins = new Set(o.rows.filter(r => r.bin && !r.noStock).map(r => r.bin)).size
  const serialLines = new Set(o.rows.filter(r => r.serial || r.serialSlots > 0).map(r => r.line_id)).size
  const stats = [
    cfg.stats.lines ? { label: 'Lines', value: String(lineCount(o.rows)) } : null,
    cfg.stats.units ? { label: 'Units to pick', value: qtyText(unitCount(o.rows)) } : null,
    cfg.stats.bins ? { label: 'Bins to visit', value: String(bins) } : null,
    cfg.stats.serials ? { label: 'Needs serials', value: String(serialLines) } : null,
  ].filter((x): x is { label: string; value: string } => !!x)
  const statsHtml = stats.length ? `<div class="sum" style="grid-template-columns:repeat(${stats.length},1fr)">${stats.map(s => `<div><div class="lbl">${s.label}</div><div class="big">${esc(s.value)}</div></div>`).join('')}</div>` : ''
  const note = cfg.footer.orderNote && o.note ? `<div class="notebox"><div class="lbl">Order note</div><p>${esc(o.note)}</p></div>` : ''
  return `<section class="sheet single">${header('Pick List', `Sales order${o.location ? ` · Ship from ${o.location}` : ''}`, o.so_number, o.so_number, cfg)}${meta}<table>${thead(cfg)}<tbody>${o.rows.map(r => rowTr(r, cfg)).join('')}</tbody></table>${statsHtml}${note}${signRow(cfg)}${fallbackFooter(printed)}</section>`
}

function consolidatedMeta(orders: PickOrder[], cfg: PickListConfig): string {
  const rows = orders.flatMap(o => o.rows)
  const dates = orders.map(o => o.ship_by).filter((d): d is string => !!d).sort()
  return metaBox([
    { label: 'Orders', value: String(orders.length) },
    { label: 'Products', value: String(new Set(rows.map(r => r.product_id)).size) },
    { label: 'Total units', value: qtyText(unitCount(rows)) },
    ...(cfg.header.shipBy ? [{ label: 'Earliest ship by', value: fmtShipBy(dates[0] ?? null) }] : []),
  ])
}

function whoLabel(o: PickOrder, cfg: PickListConfig) {
  return cfg.header.customer && o.customer ? `${o.so_number} · ${o.customer}` : o.so_number
}

function byOrderSheet(orders: PickOrder[], cfg: PickListConfig, printed: string, ref: string): string {
  const span = 2 + activeCols(cfg).length + 1
  const body = orders.map(o => {
    const bits = [cfg.header.shipBy && o.ship_by ? `Ship by ${fmtShipBy(o.ship_by)}` : '', `${lineCount(o.rows)} line${lineCount(o.rows) !== 1 ? 's' : ''}`, `${qtyText(unitCount(o.rows))} units`].filter(Boolean)
    const note = cfg.footer.orderNote && o.note ? `<tr class="onote"><td colspan="${span}">Order note: ${esc(o.note)}</td></tr>` : ''
    return `<tr class="zone"><td colspan="${span}">${esc(whoLabel(o, cfg))} <em>${bits.join(' · ')}</em></td></tr>${note}${o.rows.map(r => rowTr(r, cfg)).join('')}`
  }).join('')
  return `<section class="sheet single cons byorder">${header('Pick List', 'Consolidated · grouped by order', ref, ref, cfg)}${consolidatedMeta(orders, cfg)}<table>${thead(cfg)}<tbody>${body}</tbody></table>${signRow(cfg)}${fallbackFooter(printed)}</section>`
}

function byProductSheet(orders: PickOrder[], cfg: PickListConfig, printed: string, ref: string): string {
  type G = { first: PickRow; qty: number; slots: number; notes: Set<string>; parts: { o: PickOrder; qty: number }[] }
  const groups = new Map<string, G>()
  for (const o of orders) {
    for (const r of o.rows) {
      const k = [r.product_id, r.noStock ? 'x' : '', r.bin ?? '', r.batch ?? '', r.expiry ?? '', r.serial ?? ''].join('|')
      const g = groups.get(k) ?? { first: r, qty: 0, slots: 0, notes: new Set<string>(), parts: [] }
      g.qty += r.qty
      g.slots += r.serialSlots
      if (r.note) g.notes.add(r.note)
      const part = g.parts.find(p => p.o === o)
      if (part) part.qty += r.qty
      else g.parts.push({ o, qty: r.qty })
      groups.set(k, g)
    }
  }
  const list = [...groups.values()].sort((a, b) =>
    Number(!!a.first.noStock) - Number(!!b.first.noStock) ||
    (a.first.bin === null ? 1 : 0) - (b.first.bin === null ? 1 : 0) ||
    natural.compare(a.first.bin ?? '', b.first.bin ?? '') || natural.compare(a.first.name, b.first.name))
  const body = list.map(g => {
    const r = g.first
    const merged = { ...r, note: [...g.notes].join('; ') || null, serialSlots: Math.min(g.slots, 8) }
    const parent = `<tr class="parent"><td><span class="tick"></span></td>${productCell(r.name, r.sku)}${activeCols(cfg).map(c => cell(c.key, merged)).join('')}<td class="r"><span class="qty">${qtyText(g.qty)}<small>${esc(unitLabel(r.unit))}</small></span></td></tr>`
    const subs = g.parts.map(p => `<tr class="sub"><td></td><td colspan="${activeCols(cfg).length + 1}"><span class="sp">${esc(whoLabel(p.o, cfg))}</span></td><td class="r"><span class="qty">${qtyText(p.qty)}<small>${esc(unitLabel(r.unit))}</small></span></td></tr>`).join('')
    return parent + subs
  }).join('')
  return `<section class="sheet single cons byprod">${header('Pick List', 'Consolidated · grouped by product', ref, ref, cfg)}${consolidatedMeta(orders, cfg)}<table>${thead(cfg)}<tbody>${body}</tbody></table>${signRow(cfg)}${fallbackFooter(printed)}</section>`
}

// ── page ──
const CSS = `
*{box-sizing:border-box}
:root{--ink:#000;--mut:#4B5563;--line:#9CA3AF;--shade:#F3F4F6;--display:'Plus Jakarta Sans',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
html,body{margin:0;padding:0;background:#fff;color:var(--ink);font-family:var(--body);font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{display:flex;flex-direction:column;gap:14px;break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.mast{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding-bottom:12px;border-bottom:3px solid #000}
.doc{margin:0;font:800 34px/1 var(--display);letter-spacing:-.03em;display:flex;flex-direction:column;gap:8px}
.doc small{font:700 12px var(--display);letter-spacing:0;color:var(--mut)}
.code{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.code .no{font:700 26px/1 var(--mono);letter-spacing:-.02em}
.bc{display:block;width:320px;height:46px}
.meta{display:grid;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.meta>div{padding:10px 14px;border-right:1px solid var(--line);min-width:0}
.meta>div:last-child{border-right:0}
.lbl{font:600 9.5px var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
.val{font:600 13px/1.3 var(--display)}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
th{font:700 9.5px var(--body);letter-spacing:.09em;text-transform:uppercase;color:var(--mut);text-align:left;padding:8px 6px;border-bottom:2px solid #000;white-space:nowrap;overflow:hidden}
th.c,td.c{text-align:center}
th.r,td.r{text-align:right}
td{padding:4px 6px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:13px;line-height:1.3;overflow-wrap:anywhere}
td *{font-size:13px}
tr{break-inside:avoid;page-break-inside:avoid}
tbody tr:nth-child(even) td{background:var(--shade)}
.tick{width:16px;height:16px;border:2px solid #000;border-radius:4px;display:inline-block;vertical-align:middle}
.bin{font:700 13px var(--mono);border:1.5px solid #000;padding:1px 6px;border-radius:6px;white-space:nowrap}
.pn{font-weight:700;font-family:var(--display)}
.sku{font:500 13px var(--mono);color:var(--mut);display:block;margin-top:1px;overflow-wrap:anywhere}
.mono{font:600 13px var(--mono);white-space:nowrap}
.na{font-style:normal;color:#9CA3AF}
td.nt{font-style:italic}
td.nt b{font-style:normal}
.qty{font-weight:700;white-space:nowrap}
.qty small{font-weight:400;margin-left:3px;letter-spacing:0}
.serial{display:flex;flex-direction:column;gap:4px;margin:0 2px}
.serial span{display:block;height:15px;border-bottom:1.5px solid #000}
tr.zone td{background:#000!important;color:#fff;font:700 10.5px var(--display);letter-spacing:.12em;text-transform:uppercase;padding:6px 8px;border:0;break-after:avoid}
tr.zone td em{font-style:normal;font-weight:500;letter-spacing:.04em;text-transform:none;margin-left:10px;opacity:.9;font-size:inherit}
tr.onote td{background:#fff!important;font-style:italic;border-bottom:1px solid var(--line)}
.byprod tbody tr.parent td{background:var(--shade)!important;border-top:2px solid #000;border-bottom:0;break-after:avoid}
.byprod tbody tr.sub td{background:#fff!important;border-bottom:1px dashed var(--line);padding:3px 6px}
.byprod tbody tr.sub .sp{padding-left:14px}
.byprod tbody tr.sub .qty{font-weight:400}
.byprod tbody tr:last-child td{border-bottom:2px solid #000}
.byorder tbody tr:not(.zone):nth-child(even) td{background:var(--shade)}
.sum{display:grid;gap:10px}
.sum>div{border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.sum .big{font:800 24px/1 var(--display);letter-spacing:-.03em}
.notebox{border:1px solid var(--line);border-radius:10px;padding:10px 14px;break-inside:avoid}
.notebox p{margin:0;font-size:12px;line-height:1.5}
.sign{display:grid;gap:22px;padding-top:34px;break-inside:avoid}
.sign div{border-top:1.5px solid #000;padding-top:5px;font:600 9.5px var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.fb{display:none;justify-content:space-between;font:500 10px var(--mono);color:var(--mut);letter-spacing:.04em;border-top:1px solid var(--line);padding-top:8px}
.nomb .fb{display:flex}
`

function pageRules(printed: string): string {
  const q = printed.replace(/["\\]/g, '')
  return `@page{size:A4 portrait;margin:12mm 12mm 16mm;@bottom-left{content:"Page " counter(page) " of " counter(pages);font:500 10px 'JetBrains Mono',ui-monospace,monospace;color:#4B5563;letter-spacing:.04em}@bottom-right{content:"Printed ${q}";font:500 10px 'JetBrains Mono',ui-monospace,monospace;color:#4B5563;letter-spacing:.04em}}`
}

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">'

export type RenderOptions = {
  mode: PickListMode
  /** Settings preview: shows paper on a grey desk, never opens the print dialog */
  preview?: boolean
  now?: Date
}

export function renderPickListHtml(payload: PickListPayload, opts: RenderOptions): string {
  const cfg = payload.config
  const { printed, ref } = stamp(payload.timezone, opts.now)
  const orders = payload.orders
  const sheets =
    opts.mode === 'single' ? orders.map(o => singleSheet(o, cfg, printed)).join('')
    : opts.mode === 'consolidated-order' ? byOrderSheet(orders, cfg, printed, ref)
    : byProductSheet(orders, cfg, printed, ref)
  const title = opts.mode === 'single' ? (orders.length === 1 ? `Pick List ${orders[0].so_number}` : `Pick Lists (${orders.length} orders)`) : `Consolidated Pick List ${ref}`

  const previewCss = `body{background:#E5E9EA;padding:20px 0}.sheet{width:794px;min-height:1123px;margin:0 auto 20px;padding:40px 44px 34px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12),0 12px 32px rgba(0,0,0,.12);break-after:auto}.fb{display:flex;margin-top:auto}.fb .pg::before{content:"Page 1 of 1"}`
  const printJs = `<script>(function(){var ua=navigator.userAgentData&&navigator.userAgentData.brands||[];var v=0;ua.forEach(function(b){if(/Chrom/i.test(b.brand))v=Math.max(v,parseInt(b.version,10)||0)});if(v<131)document.documentElement.classList.add('nomb');function go(){setTimeout(function(){window.focus();window.print()},150)}var done=false;function once(){if(done)return;done=true;go()}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(once);setTimeout(once,2500)}else{once()}})()</script>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${FONTS}<style>${CSS}${opts.preview ? previewCss : pageRules(printed)}</style></head><body>${sheets}${opts.preview ? '' : printJs}</body></html>`
}

// Sample data for the Settings preview
export const SAMPLE_PICK_LIST: PickOrder[] = (() => {
  const row = (line_id: string, name: string, sku: string, bin: string | null, qty: number, extra: Partial<PickRow> = {}, unit = 'Each'): PickRow =>
    ({ line_id, product_id: sku, name, sku, note: null, unit, qty, bin, batch: null, expiry: null, serial: null, serialSlots: 0, ...extra })
  const o = (id: string, so: string, customer: string, ship_by: string, rows: PickRow[], note: string | null = null): PickOrder =>
    ({ id, so_number: so, customer, ship_by, note, location: 'New Location', needsSerials: rows.some(r => r.serialSlots > 0), rows })
  return [
    o('a', 'SO-0004', 'Abatz', '2026-10-02', [
      row('a1', 'Adjustable Garden Rake', '001', 'A-01-2', 2),
      row('a2', 'Stainless Steel Water Bottle 750ml', 'WB-750', 'A-03-1', 4, { batch: 'B-2210', expiry: '2027-03-14' }),
      row('a3', 'Ceramic Planter, 20cm', 'CP-20', 'A-06-2', 3),
      row('a4', 'USB-C Hub 7-in-1', 'HUB-7C', 'B-05-4', 1),
    ]),
    o('b', 'SO-0005', 'Centimia', '2026-10-03', [
      row('b1', 'Adjustable Garden Rake', '001', 'A-01-2', 6),
      row('b2', 'Stainless Steel Water Bottle 750ml', 'WB-750', 'A-03-1', 5, { batch: 'B-2210', expiry: '2027-03-14' }),
      row('b3', 'Bamboo Cutting Board, Large', 'BCB-L', 'A-04-3', 3),
      row('b4', 'Noise Cancelling Headphones', 'NCH-02', 'B-02-1', 2, { note: 'Keep in retail boxes', serialSlots: 2 }),
      row('b5', 'USB-C Hub 7-in-1', 'HUB-7C', 'B-05-4', 1),
      row('b6', 'Packing Tape 48mm × 75m', 'PT-4875', 'BULK-2', 12, {}, 'Roll'),
    ], 'Deliver to the loading dock, ask for Aroha on arrival.'),
    o('c', 'SO-0006', 'Harbour Cafe', '2026-10-03', [
      row('c1', 'Stainless Steel Water Bottle 750ml', 'WB-750', 'A-03-1', 4, { batch: 'B-2210', expiry: '2027-03-14' }),
      row('c2', 'Ceramic Planter, 20cm', 'CP-20', 'A-06-2', 2),
      row('c3', 'Noise Cancelling Headphones', 'NCH-02', 'B-02-1', 1, { note: 'Keep in retail boxes', serialSlots: 1 }),
    ]),
    o('d', 'SO-0007', 'Westgate Stores', '2026-10-05', [
      row('d1', 'Adjustable Garden Rake', '001', 'A-01-2', 1),
      row('d2', 'Bamboo Cutting Board, Large', 'BCB-L', 'A-04-3', 3),
    ]),
  ]
})()
