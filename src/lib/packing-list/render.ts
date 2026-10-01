// src/lib/packing-list/render.ts
// Turns packing list data into a print-ready HTML page (black and white, A4 portrait). One page per order; several
// orders print as one document. What is shown is controlled by PackingListConfig
// (Settings → Sales → Sales Documents → Packing List).

import { barcodeSvg } from '@/lib/pick-list/barcode'
import type { PackingListConfig } from './config'
import type { PackAddress, PackOrder, PackRow, PackBusiness, PackingListPayload } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(d: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}
function fmtExpiry(d: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''
}
const qtyText = (n: number) => String(Math.round(n * 1000) / 1000)

function stamp(tz: string, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-NZ', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const printed = fmt.format(now).replace(/[\u202f\u00a0]/g, ' ')
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return { printed, today: iso }
}

const dash = '<em class="na">—</em>'
const mono = (v: string | null | undefined) => (v ? `<span class="mono">${esc(v)}</span>` : dash)

// ── pieces ──
function mast(o: PackOrder, biz: PackBusiness, cfg: PackingListConfig): string {
  const h = cfg.header
  const contact = [biz.address.join(', '), [biz.phone, biz.email].filter(Boolean).join(' · '), biz.tax_number].filter(Boolean)
  const left = [
    h.logo && biz.logo_url ? `<img class="logo" alt="" src="${esc(biz.logo_url)}">` : '',
    h.businessDetails && biz.name ? `<div class="bn">${esc(biz.name)}</div>` : '',
    h.businessDetails && contact.length ? `<div class="ba">${contact.map(esc).join('<br>')}</div>` : '',
  ].join('')
  // a barcode with its quiet zone trimmed, so the bars line up with the order number above them
  const bars = h.barcode ? barcodeSvg(o.so_number, 320, 46).replace(/viewBox="0 0 (\d+) 1"/, (_m, w) => `viewBox="10 0 ${Number(w) - 20} 1"`) : ''
  return `<header class="mast"><div class="biz">${left}</div><div class="doc"><h2>Packing List</h2><div class="no">${esc(o.so_number)}</div>${bars}</div></header>`
}

function metaBox(cells: { label: string; value: string }[]): string {
  if (!cells.length) return ''
  return `<div class="meta" style="grid-template-columns:repeat(${cells.length},1fr)">${cells.map(c => `<div><div class="lbl">${esc(c.label)}</div><div class="val">${esc(c.value) || '—'}</div></div>`).join('')}</div>`
}

function addrBox(label: string, a: PackAddress | null): string {
  if (!a) return `<div class="box"><div class="lbl">${label}</div><div class="nm">—</div></div>`
  return `<div class="box"><div class="lbl">${label}</div><div class="nm">${esc(a.name) || '—'}</div>${a.lines.length ? `<p>${a.lines.map(esc).join('<br>')}</p>` : ''}${a.phone ? `<div class="ph">Phone: ${esc(a.phone)}</div>` : ''}</div>`
}

function shippingStrip(o: PackOrder, cfg: PackingListConfig): string {
  const s = cfg.shipping
  const cells = [
    s.carrier ? { label: 'Carrier', value: o.carrier, w: 1.1, mono: false } : null,
    s.service ? { label: 'Service', value: o.service, w: 1.5, mono: false } : null,
    s.tracking ? { label: 'Tracking number', value: o.tracking, w: 1.8, mono: true } : null,
    s.packages ? { label: 'Packages', value: o.packages ? String(o.packages) : '', w: 0.8, mono: false } : null,
  ].filter((x): x is { label: string; value: string; w: number; mono: boolean } => !!x)
  if (!cells.length) return ''
  return `<div class="ship" style="grid-template-columns:${cells.map(c => `${c.w}fr`).join(' ')}">${cells.map(c => `<div><div class="lbl">${c.label}</div><div class="val${c.mono ? ' m' : ''}">${esc(c.value) || '—'}</div></div>`).join('')}</div>`
}

type ColKey = 'batch' | 'serial' | 'expiry' | 'ordered' | 'backorder'
const COL_DEFS: { key: ColKey; label: string; w: number; right?: boolean }[] = [
  { key: 'batch', label: 'Batch', w: 72 },
  { key: 'serial', label: 'Serial', w: 106 },
  { key: 'expiry', label: 'Expiry', w: 62 },
  { key: 'ordered', label: 'Ordered', w: 66, right: true },
]
const activeCols = (cfg: PackingListConfig) => COL_DEFS.filter(c => cfg.columns[c.key])

function thead(cfg: PackingListConfig): string {
  return `<thead><tr><th style="width:26px">#</th><th>Product</th>${activeCols(cfg).map(c => `<th class="${c.right ? 'r' : ''}" style="width:${c.w}px">${c.label}</th>`).join('')}<th class="r" style="width:66px">Shipped</th>${cfg.columns.backorder ? '<th class="r" style="width:88px">Back-order</th>' : ''}</tr></thead>`
}

function rowTr(r: PackRow, n: number | null, nextCont: boolean, cfg: PackingListConfig): string {
  const cell = (k: ColKey): string => {
    switch (k) {
      case 'batch': return `<td>${mono(r.batch)}</td>`
      case 'serial': return `<td class="ser">${r.serials.length ? r.serials.map(s => `<span class="mono">${esc(s)}</span>`).join('<br>') : dash}</td>`
      case 'expiry': return `<td>${mono(fmtExpiry(r.expiry))}</td>`
      case 'ordered': return `<td class="r">${r.ordered === null ? '' : qtyText(r.ordered)}</td>`
      default: return '<td></td>'
    }
  }
  const prod = r.continued
    ? '<td></td>'
    : `<td><div class="pn">${esc(r.name)}</div>${r.sku ? `<div class="sku">${esc(r.sku)}</div>` : ''}${cfg.columns.notes && r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</td>`
  const bo = cfg.columns.backorder ? `<td class="r ${r.backorder ? 'bo' : ''}">${r.backorder === null ? '' : r.backorder ? qtyText(r.backorder) : '—'}</td>` : ''
  return `<tr class="${nextCont ? 'nb' : ''}${r.continued ? ' cont' : ''}"><td class="n">${n ?? ''}</td>${prod}${activeCols(cfg).map(c => cell(c.key)).join('')}<td class="r b">${qtyText(r.shipped)}</td>${bo}</tr>`
}

function tbody(rows: PackRow[], cfg: PackingListConfig): string {
  let n = 0
  return rows.map((r, i) => rowTr(r, r.continued ? null : ++n, !!rows[i + 1]?.continued, cfg)).join('')
}

function stats(o: PackOrder, cfg: PackingListConfig): string {
  const lines = new Set(o.rows.map(r => r.line_id)).size
  const units = o.rows.reduce((s, r) => s + r.shipped, 0)
  const backordered = o.rows.reduce((s, r) => s + (r.backorder ?? 0), 0)
  const cells = [
    cfg.stats.lines ? { label: 'Lines', value: String(lines) } : null,
    cfg.stats.units ? { label: 'Units shipped', value: qtyText(units) } : null,
    cfg.stats.backordered ? { label: 'Back-ordered', value: qtyText(backordered) } : null,
    cfg.stats.packages ? { label: 'Packages', value: o.packages ? String(o.packages) : '—' } : null,
  ].filter((x): x is { label: string; value: string } => !!x)
  if (!cells.length) return ''
  return `<div class="sum" style="grid-template-columns:repeat(${cells.length},1fr)">${cells.map(c => `<div><div class="lbl">${c.label}</div><div class="big">${esc(c.value)}</div></div>`).join('')}</div>`
}

function signRow(cfg: PackingListConfig): string {
  const items = [cfg.footer.packedBy ? 'Packed by' : '', cfg.footer.receivedBy ? 'Received by' : ''].filter(Boolean)
  if (!items.length) return ''
  return `<div class="sign" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(i => `<div><span>${i}</span><span>Date</span></div>`).join('')}</div>`
}

// totals, notes and signatures stay together, so a signature line is never left alone on a page of its own
const tail = (html: string) => (html ? `<div class="tail">${html}</div>` : '')

const fallbackFooter = (printed: string) => `<div class="fb"><span class="pg"></span><span>Printed ${esc(printed)}</span></div>`

function sheet(o: PackOrder, biz: PackBusiness, cfg: PackingListConfig, printed: string, today: string): string {
  const meta = metaBox([
    ...(cfg.meta.orderDate ? [{ label: 'Order date', value: fmtDate(o.order_date) }] : []),
    ...(cfg.meta.shipDate ? [{ label: 'Ship date', value: fmtDate(o.ship_date ?? today) }] : []),
    ...(cfg.meta.customerRef ? [{ label: 'Customer order #', value: o.customer_ref ?? '' }] : []),
    ...(cfg.meta.shipBy ? [{ label: 'Ship by', value: fmtDate(o.ship_by) }] : []),
  ])
  const boxes = [cfg.addresses.shipFrom ? addrBox('Ship from', o.ship_from) : '', cfg.addresses.shipTo ? addrBox('Ship to', o.ship_to) : ''].filter(Boolean)
  const addresses = boxes.length ? `<div class="addr" style="grid-template-columns:repeat(${boxes.length},1fr)">${boxes.join('')}</div>` : ''
  const notes = cfg.footer.deliveryNotes && o.notes ? `<div class="notebox"><div class="lbl">Delivery notes</div><p>${esc(o.notes)}</p></div>` : ''
  return `<section class="sheet">${mast(o, biz, cfg)}${meta}${addresses}${shippingStrip(o, cfg)}<table>${thead(cfg)}<tbody>${tbody(o.rows, cfg)}</tbody></table>${tail(stats(o, cfg) + notes + signRow(cfg))}${fallbackFooter(printed)}</section>`
}

// ── page ──
const CSS = `
*{box-sizing:border-box}
:root{--ink:#000;--mut:#4B5563;--line:#9CA3AF;--shade:#F3F4F6;--display:'Plus Jakarta Sans',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
html,body{margin:0;padding:0;background:#fff;color:var(--ink);font-family:var(--body);font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{display:flex;flex-direction:column;gap:13px;break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.mast{display:grid;grid-template-columns:1fr auto;gap:24px;padding-bottom:14px;border-bottom:3px solid #000;align-items:start}
.biz{display:flex;flex-direction:column;gap:9px;align-items:flex-start;min-width:0}
.logo{display:block;max-height:64px;max-width:230px;width:auto;height:auto;object-fit:contain}
.bn{font:800 17px var(--display);letter-spacing:-.01em}
.ba{font-size:11px;line-height:1.5;color:var(--mut);margin-top:-4px}
.doc{text-align:right}
.doc h2{margin:0;font:800 30px/1 var(--display);letter-spacing:-.03em}
.doc .no{font:700 18px var(--mono);margin-top:8px}
.bc{display:block;width:320px;height:46px;margin:8px 0 0 auto}
.meta{display:grid;border:1.5px solid #000;border-radius:8px;overflow:hidden}
.meta>div{padding:8px 12px;border-right:1px solid var(--line);min-width:0}
.meta>div:last-child{border-right:0}
.lbl{font:600 9px var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
.val{font:600 12.5px/1.3 var(--display);overflow-wrap:anywhere}
.val.m{font:700 13px var(--mono);letter-spacing:.02em}
.addr{display:grid;gap:12px}
.box{border:1.5px solid #000;border-radius:8px;padding:11px 14px;min-height:84px;break-inside:avoid}
.box .nm{font:700 14px var(--display);margin:3px 0 4px}
.box p{margin:0;line-height:1.5;font-size:12px}
.box .ph{margin-top:6px;color:var(--mut);font-size:11px}
.ship{display:grid;border:1.5px solid #000;border-radius:8px;overflow:hidden;background:var(--shade)}
.ship>div{padding:9px 12px;border-right:1px solid var(--line);min-width:0}
.ship>div:last-child{border-right:0}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
th{font:700 9px var(--body);letter-spacing:.09em;text-transform:uppercase;color:var(--mut);text-align:left;padding:8px 6px;border-bottom:2px solid #000;white-space:nowrap;overflow:hidden}
th.r,td.r{text-align:right}
td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top;font-size:12px;overflow-wrap:anywhere}
tr{break-inside:avoid;page-break-inside:avoid}
tr.nb td{border-bottom:0}
td.n{color:var(--mut);font:600 11px var(--mono)}
.pn{font:700 12.5px var(--display)}
.sku{font:500 11px var(--mono);color:var(--mut);margin-top:1px}
.note{font-size:10.5px;font-style:italic;color:var(--mut);margin-top:3px}
.mono{font:600 11px var(--mono);white-space:nowrap}
td.ser{line-height:1.55}
.na{font-style:normal;color:#9CA3AF}
td.r{font:700 13px var(--display);white-space:nowrap}
td.b{font-weight:800;font-size:14px}
td.bo{font-weight:800}
.sum{display:grid;border:1.5px solid #000;border-radius:8px;overflow:hidden;break-inside:avoid}
.sum>div{padding:9px 12px;border-right:1px solid var(--line)}
.sum>div:last-child{border-right:0}
.sum .big{font:800 20px var(--display)}
.notebox{border:1.5px solid #000;border-radius:8px;padding:10px 14px;min-height:56px;break-inside:avoid}
.notebox p{margin:3px 0 0;line-height:1.5;font-size:12px}
.tail{display:flex;flex-direction:column;gap:13px;break-inside:avoid;page-break-inside:avoid}
.sign{display:grid;gap:28px;padding-top:26px;break-inside:avoid}
.sign div{border-top:1.5px solid #000;padding-top:5px;display:flex;justify-content:space-between;font:600 9px var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.fb{display:none;justify-content:space-between;font:500 10px var(--mono);color:var(--mut);letter-spacing:.04em;border-top:1px solid var(--line);padding-top:8px}
.nomb .fb{display:flex}
`

function pageRules(printed: string): string {
  const q = printed.replace(/["\\]/g, '')
  return `@page{size:A4 portrait;margin:12mm 12mm 16mm;@bottom-left{content:"Page " counter(page) " of " counter(pages);font:500 10px 'JetBrains Mono',ui-monospace,monospace;color:#4B5563;letter-spacing:.04em}@bottom-right{content:"Printed ${q}";font:500 10px 'JetBrains Mono',ui-monospace,monospace;color:#4B5563;letter-spacing:.04em}}`
}

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">'

export type PackRenderOptions = {
  /** Settings preview: shows paper on a grey desk, never opens the print dialog */
  preview?: boolean
  now?: Date
}

export function renderPackingListHtml(payload: PackingListPayload, opts: PackRenderOptions = {}): string {
  const cfg = payload.config
  const { printed, today } = stamp(payload.timezone, opts.now)
  const orders = payload.orders
  const sheets = orders.map(o => sheet(o, payload.business, cfg, printed, today)).join('')
  const title = orders.length === 1 ? `Packing List ${orders[0].so_number}` : `Packing Lists (${orders.length} orders)`

  const previewCss = `body{background:#E5E9EA;padding:20px 0}.sheet{width:794px;min-height:1123px;margin:0 auto 20px;padding:44px 44px 34px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12),0 12px 32px rgba(0,0,0,.12);break-after:auto}.fb{display:flex;margin-top:auto}.fb .pg::before{content:"Page 1 of 1"}`
  // Print once the fonts and the logo have loaded (Chrome / Edge before 131 cannot do page numbers in the margin, so the footer is drawn in the page)
  const printJs = `<script>(function(){var ua=navigator.userAgentData&&navigator.userAgentData.brands||[];var v=0;ua.forEach(function(b){if(/Chrom/i.test(b.brand))v=Math.max(v,parseInt(b.version,10)||0)});if(v<131)document.documentElement.classList.add('nomb');var done=false;function go(){if(done)return;done=true;setTimeout(function(){window.focus();window.print()},150)}var waits=[];if(document.fonts&&document.fonts.ready)waits.push(document.fonts.ready);Array.prototype.forEach.call(document.images,function(i){if(!i.complete)waits.push(new Promise(function(r){i.onload=r;i.onerror=r}))});Promise.all(waits).then(go);setTimeout(go,3500)})()</script>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${FONTS}<style>${CSS}${opts.preview ? previewCss : pageRules(printed)}</style></head><body>${sheets}${opts.preview ? '' : printJs}</body></html>`
}

// ── sample data for the Settings preview ──
const SAMPLE_LOGO = 'data:image/svg+xml;base64,' + (typeof btoa === 'function'
  ? btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 90" width="440" height="90"><path d="M8 74 L38 16 L68 74 Z" fill="none" stroke="#111" stroke-width="9" stroke-linejoin="round"/><circle cx="38" cy="58" r="7" fill="#111"/><text x="92" y="48" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="40" fill="#111" letter-spacing="-1">YOUR LOGO</text><text x="94" y="76" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="20" fill="#555" letter-spacing="9">GOES HERE</text></svg>')
  : '')

export const SAMPLE_PACK_BUSINESS: PackBusiness = {
  name: 'Your Business Ltd',
  logo_url: SAMPLE_LOGO,
  address: ['14 Wairau Road, Glenfield, Auckland 0627'],
  phone: '09 555 0142',
  email: 'orders@yourbusiness.example',
  tax_number: 'NZBN/ABN 9429 0000 0000 0',
}

export const SAMPLE_PACK_ORDERS: PackOrder[] = (() => {
  const r = (line_id: string, name: string, sku: string, shipped: number, ordered: number, extra: Partial<PackRow> = {}): PackRow =>
    ({ line_id, name, sku, note: null, unit: 'Each', ordered, shipped, backorder: Math.max(ordered - shipped, 0), batch: null, expiry: null, serials: [], ...extra })
  return [{
    id: 'a', so_number: 'SO-0005', order_date: '2026-09-28', ship_date: '2026-10-02', ship_by: '2026-10-03', customer_ref: 'PO-88213',
    ship_from: { name: 'Auckland Warehouse', lines: ['Unit 3, 22 Constellation Drive', 'Rosedale, Auckland 0632', 'New Zealand'], phone: '09 555 0198' },
    ship_to: { name: 'Summit Gear Co.', lines: ['118 Colombo Street', 'Christchurch 8023', 'New Zealand'], phone: '03 555 0177' },
    carrier: 'NZ Post', service: 'Courier · Overnight', tracking: 'NZ4829175530', packages: 2,
    notes: 'Please deliver to the loading dock at the rear. Head torch balance of 2 to follow on the next shipment.',
    rows: [
      r('1', 'Merino Crew Sock, Charcoal (M)', 'SOC-MER-CH-M', 24, 24, { batch: 'B2410' }),
      r('2', 'Trail Pack 28L, Olive', 'PCK-TRL-28-OL', 3, 3, { serials: ['TP28-10418', 'TP28-10419', 'TP28-10422'] }),
      r('3', 'Insulated Bottle 750ml', 'BTL-INS-750', 12, 12, { batch: 'B2398', note: 'Handle with care — glass lid' }),
      r('4', 'Head Torch 300 Lumen', 'TRC-HD-300', 4, 6, { batch: 'B2402', note: 'Batteries packed separately', serials: ['HT3-55021', 'HT3-55022', 'HT3-55024', 'HT3-55027'] }),
      r('5', 'Seam Sealer 250ml', 'SLR-SEAM-250', 10, 10, { batch: 'B2405', expiry: '2027-03-14' }),
      r('6', 'Repair Kit — Tent Pole', 'RPK-TNT-01', 5, 5),
    ],
  }]
})()
