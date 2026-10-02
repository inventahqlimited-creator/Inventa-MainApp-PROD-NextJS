// src/lib/invoice/render.ts
// Turns invoice data into a print-ready HTML page (A4 portrait, charcoal and soft grey with one muted accent).
// One invoice per order; several orders print as one document. What is shown is controlled by InvoiceConfig
// (Settings → Sales → Sales Documents → Invoice).

import type { InvoiceConfig } from './config'
import type { InvoiceAddress, InvoiceBusiness, InvoiceOrder, InvoicePayload } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(d: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}
const qtyText = (n: number) => String(Math.round(n * 1000) / 1000)

function today(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** "Net 14" → 14 days after the invoice date; COD / Prepaid → the invoice date itself; anything else → no date. */
function dueDate(terms: string | null, invoiceDate: string): string | null {
  if (!terms) return null
  const net = /^net\s*(\d+)/i.exec(terms.trim())
  if (net) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(invoiceDate)
    if (!m) return null
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(net[1])))
    return d.toISOString().slice(0, 10)
  }
  if (/^(cod|prepaid)/i.test(terms.trim())) return invoiceDate
  return null
}

const dash = '—'

// ── pieces ──
function mast(o: InvoiceOrder, biz: InvoiceBusiness, cfg: InvoiceConfig): string {
  const contact = [biz.address.join(', '), [biz.phone, biz.email].filter(Boolean).join(' · '), biz.numbers.join(' · ')].filter(Boolean)
  const left = [
    cfg.header.logo && biz.logo_url ? `<img class="logo" alt="" src="${esc(biz.logo_url)}">` : '',
    cfg.header.businessDetails && biz.name ? `<div class="bn">${esc(biz.name)}</div>` : '',
    cfg.header.businessDetails && contact.length ? `<div class="ba">${contact.map(esc).join('<br>')}</div>` : '',
  ].join('')
  // "Tax Invoice" is the wording required for businesses that are registered for tax
  const title = o.is_quote ? 'Quote' : biz.numbers.some(n => n.startsWith('Tax no.')) ? 'Tax Invoice' : 'Invoice'
  return `<header class="mast"><div class="biz">${left}</div><div class="doc"><h2>${title}</h2><div class="no">${esc(o.invoice_number)}</div></div></header>`
}

function addrBlock(label: string, a: InvoiceAddress | null): string {
  if (!a) return `<div><div class="lbl">${label}</div><div class="nm">${dash}</div></div>`
  return `<div><div class="lbl">${label}</div><div class="nm">${esc(a.name) || dash}</div>${a.lines.length ? `<p>${a.lines.map(esc).join('<br>')}</p>` : ''}${a.email ? `<div class="sub">${esc(a.email)}</div>` : ''}</div>`
}

function info(o: InvoiceOrder, cfg: InvoiceConfig, invoiceDate: string): string {
  const d = cfg.details
  const due = dueDate(o.terms, invoiceDate)
  const kv = [
    d.invoiceDate ? [o.is_quote ? 'Quote date' : 'Invoice date', fmtDate(invoiceDate)] : null,
    d.dueDate && !o.is_quote ? ['Due date', due ? fmtDate(due) : dash] : null,
    d.terms ? ['Terms', o.terms ?? dash] : null,
    d.orderNumber ? ['Order #', o.so_number] : null,
    d.customerPo && o.customer_po ? ['Customer PO', o.customer_po] : null,
  ].filter((x): x is string[] => !!x)
  const blocks = [
    cfg.addresses.billTo ? { w: '1fr', html: addrBlock('Bill to', o.bill_to) } : null,
    cfg.addresses.shipTo ? { w: '1fr', html: addrBlock('Ship to', o.ship_to) } : null,
    kv.length ? { w: '1.05fr', html: `<div><div class="lbl">Invoice details</div><div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div></div>` } : null,
  ].filter((x): x is { w: string; html: string } => !!x)
  if (!blocks.length) return ''
  return `<div class="info" style="grid-template-columns:${blocks.map(b => b.w).join(' ')}">${blocks.map(b => b.html).join('')}</div>`
}

type Col = { key: 'unitPrice' | 'discount' | 'tax'; label: string; w: number }
const COLS: Col[] = [
  { key: 'unitPrice', label: 'Unit price', w: 88 },
  { key: 'discount', label: 'Disc.', w: 52 },
  { key: 'tax', label: 'Tax', w: 50 },
]

function table(o: InvoiceOrder, cfg: InvoiceConfig, money: (n: number) => string): string {
  const cols = COLS.filter(c => cfg.columns[c.key])
  const head = `<thead><tr><th>Description</th><th class="r" style="width:50px">Qty</th>${cols.map(c => `<th class="r" style="width:${c.w}px">${c.label}</th>`).join('')}<th class="r" style="width:100px">Amount</th></tr></thead>`
  const desc = (name: string, sub: string) => `<td><div class="pn">${esc(name)}</div>${sub ? `<div class="sku">${esc(sub)}</div>` : ''}</td>`
  const rows = o.lines.map(l => {
    const cells = cols.map(c => `<td class="r">${c.key === 'unitPrice' ? money(l.unitPrice) : c.key === 'discount' ? (l.discount ? `${qtyText(l.discount)}%` : dash) : `${qtyText(l.taxRate)}%`}</td>`).join('')
    return `<tr>${desc(l.name, cfg.columns.sku ? l.sku : '')}<td class="r">${qtyText(l.qty)}</td>${cells}<td class="r b">${money(l.amount)}</td></tr>`
  }).join('')
  const costs = o.costs.length
    ? `<tr class="band"><td colspan="${3 + cols.length}">Additional costs</td></tr>` + o.costs.map(c =>
      `<tr>${desc(c.name, c.sub)}<td class="r"></td>${cols.map(col => `<td class="r">${col.key === 'tax' ? `${qtyText(c.taxRate)}%` : ''}</td>`).join('')}<td class="r b">${money(c.amount)}</td></tr>`).join('')
    : ''
  return `<table>${head}<tbody>${rows}${costs}</tbody></table>`
}

function totals(o: InvoiceOrder, money: (n: number) => string): string {
  const breakdown = o.costs.length > 0 || o.discount_amount > 0
  const row = (label: string, value: string, cls = '') => `<div class="row ${cls}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`
  const parts = [
    breakdown ? row('Items subtotal', money(o.items_subtotal), 'm') : '',
    o.costs.length ? row('Additional costs', money(o.costs_subtotal), 'm') : '',
    o.discount_amount > 0 ? row('Discount', `−${money(o.discount_amount)}`, 'm') : '',
    row('Subtotal (excl. tax)', money(o.subtotal)),
    ...(o.taxes.length ? o.taxes.map(t => row(t.label, money(t.amount), 'm')) : [row('Tax', money(0), 'm')]),
    row(`Total ${o.currency}`, money(o.total), 't'),
  ].join('')
  return `<div><div class="tot">${parts}</div><div class="due"><span>${o.is_quote ? 'Quote total' : 'Amount due'}</span><span>${esc(o.currency)} ${esc(money(o.total))}</span></div></div>`
}

function left(o: InvoiceOrder, cfg: InvoiceConfig): string {
  const c = cfg.content
  const bank = [['Bank', c.bankName], ['Account name', c.accountName], ['Account number', c.accountNumber]].filter(([, v]) => v)
  const pay = cfg.footer.paymentDetails && bank.length && !o.is_quote
    ? `<div class="pay"><div class="lbl">Payment details</div><div class="kv">${[...bank, ['Reference', o.invoice_number]].map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div></div>`
    : ''
  const notes = [o.notes, c.notes].filter(Boolean).join('\n\n')
  const note = cfg.footer.notes && notes ? `<div class="note"><div class="lbl">Notes</div><p>${esc(notes).replace(/\n/g, '<br>')}</p></div>` : ''
  return pay || note ? `<div class="stack">${pay}${note}</div>` : '<div></div>'
}

function sheet(o: InvoiceOrder, biz: InvoiceBusiness, cfg: InvoiceConfig, dp: number, tz: string, now?: Date): string {
  const money = (n: number) => new Intl.NumberFormat('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)
  const invoiceDate = o.invoice_date ?? today(tz, now)
  return `<section class="sheet">${mast(o, biz, cfg)}${info(o, cfg, invoiceDate)}${table(o, cfg, money)}<div class="tail below">${left(o, cfg)}${totals(o, money)}</div><div class="fb"><span class="pg"></span></div></section>`
}

// ── page ──
const CSS = `
*{box-sizing:border-box}
:root{--ink:#1C1F24;--mut:#6B7280;--line:#DADDE1;--tint:#F4F5F6;--acc:#3D5A6C;--display:'Plus Jakarta Sans','Inter',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
html,body{margin:0;padding:0;background:#fff;color:var(--ink);font-family:var(--body);font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{display:flex;flex-direction:column;gap:20px;break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.mast{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start}
.biz{display:flex;flex-direction:column;gap:9px;align-items:flex-start;min-width:0}
.logo{display:block;max-height:60px;max-width:220px;width:auto;height:auto;object-fit:contain}
.bn{font:700 15px var(--display)}
.ba{font-size:11px;line-height:1.55;color:var(--mut);margin-top:-4px}
.doc{text-align:right}
.doc h2{margin:0;font:300 34px/1 var(--display);letter-spacing:-.02em;color:var(--acc);text-transform:uppercase}
.doc .no{font:600 15px var(--mono);margin-top:10px}
.info{display:grid;gap:28px;break-inside:avoid}
.info>div{min-width:0}
.lbl{font:600 9px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin-bottom:6px}
.nm{font:700 13.5px var(--display);margin-bottom:3px}
.info p{margin:0;line-height:1.55;font-size:12px}
.info .sub{color:var(--mut);font-size:11px;margin-top:5px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}
.kv span:nth-child(odd){color:var(--mut)}
.kv span:nth-child(even){text-align:right;font-weight:600;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
th{font:600 9px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--mut);text-align:left;padding:9px 8px;border-top:1px solid var(--ink);border-bottom:1px solid var(--line);background:var(--tint)}
th.r,td.r{text-align:right}
td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:12px;overflow-wrap:anywhere}
tr{break-inside:avoid;page-break-inside:avoid}
.pn{font:600 12.5px var(--display)}
.sku{font:500 10.5px var(--mono);color:var(--mut);margin-top:2px}
td.r{font-variant-numeric:tabular-nums;white-space:nowrap}
td.b{font-weight:700}
tr.band td{background:var(--tint);font:600 9px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--mut);padding:8px;border-top:1px solid var(--ink)}
.below{display:grid;grid-template-columns:1fr 285px;gap:34px;align-items:start}
.tail{break-inside:avoid;page-break-inside:avoid}
.stack{display:flex;flex-direction:column;gap:18px}
.pay{border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.pay .kv{font-size:11.5px}
.pay .kv span:nth-child(even){text-align:left;font-family:var(--mono);font-weight:500}
.note p{margin:0;line-height:1.55;font-size:11.5px;color:#374151}
.tot{display:flex;flex-direction:column}
.tot .row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px}
.tot .row span:last-child{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.tot .row.t span{font-weight:700;font-size:13.5px}
.tot .row.m span{color:var(--mut)}
.due{display:flex;justify-content:space-between;align-items:baseline;gap:12px;background:var(--acc);color:#fff;border-radius:8px;padding:13px 14px;margin-top:12px}
.due span:first-child{font:600 9.5px var(--body);letter-spacing:.12em;text-transform:uppercase;opacity:.85}
.due span:last-child{font:700 21px var(--display);font-variant-numeric:tabular-nums;white-space:nowrap}
.fb{display:none}
`

function pageRules(): string {
  return `@page{size:A4 portrait;margin:12mm 12mm 16mm;@bottom-left{content:"Page " counter(page) " of " counter(pages);font:500 10px 'JetBrains Mono',ui-monospace,monospace;color:#6B7280;letter-spacing:.04em}}`
}

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@300;600;700&display=swap">'

export type InvoiceRenderOptions = {
  /** Settings preview: shows paper on a grey desk, never opens the print dialog */
  preview?: boolean
  now?: Date
}

export function renderInvoiceHtml(payload: InvoicePayload, opts: InvoiceRenderOptions = {}): string {
  const sheets = payload.orders.map(o => sheet(o, payload.business, payload.config, payload.decimals, payload.timezone, opts.now)).join('')
  const title = payload.orders.length === 1 ? `${payload.orders[0].is_quote ? 'Quote' : 'Invoice'} ${payload.orders[0].invoice_number}` : `Invoices (${payload.orders.length} orders)`
  const previewCss = `body{background:#E5E9EA;padding:20px 0}.sheet{width:794px;min-height:1123px;margin:0 auto 20px;padding:48px 48px 34px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12),0 12px 32px rgba(0,0,0,.12);break-after:auto}.tail{margin-top:auto}.fb{display:flex;font:500 10px var(--mono);color:var(--mut);letter-spacing:.04em;border-top:1px solid var(--line);padding-top:9px}.fb .pg::before{content:"Page 1 of 1"}`
  // Print once the fonts and the logo have loaded
  const printJs = `<script>(function(){var done=false;function go(){if(done)return;done=true;setTimeout(function(){window.focus();window.print()},150)}var waits=[];if(document.fonts&&document.fonts.ready)waits.push(document.fonts.ready);Array.prototype.forEach.call(document.images,function(i){if(!i.complete)waits.push(new Promise(function(r){i.onload=r;i.onerror=r}))});Promise.all(waits).then(go);setTimeout(go,3500)})()</script>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${FONTS}<style>${CSS}${opts.preview ? previewCss : pageRules()}</style></head><body>${sheets}${opts.preview ? '' : printJs}</body></html>`
}

// ── sample data for the Settings preview ──
const SAMPLE_LOGO = 'data:image/svg+xml;base64,' + (typeof btoa === 'function'
  ? btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 90" width="440" height="90"><path d="M8 74 L38 16 L68 74 Z" fill="none" stroke="#1C1F24" stroke-width="9" stroke-linejoin="round"/><circle cx="38" cy="58" r="7" fill="#1C1F24"/><text x="92" y="48" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="40" fill="#1C1F24" letter-spacing="-1">YOUR LOGO</text><text x="94" y="76" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="20" fill="#555" letter-spacing="9">GOES HERE</text></svg>')
  : '')

export const SAMPLE_INVOICE_BUSINESS: InvoiceBusiness = {
  name: 'Your Business Ltd',
  logo_url: SAMPLE_LOGO,
  address: ['14 Wairau Road, Glenfield, Auckland 0627'],
  phone: '09 555 0142',
  email: 'accounts@yourbusiness.example',
  numbers: ['Tax no. 123-456-789', 'NZBN 9429 0000 0000 0'],
}

export const SAMPLE_INVOICES: InvoiceOrder[] = [{
  id: 'a', so_number: 'SO-0005', invoice_number: 'INV-0005', invoice_date: '2026-10-02', terms: 'Net 14', customer_po: 'PO-88213',
  notes: 'Head torch balance of 2 will be invoiced when it ships.', currency: 'NZD',
  bill_to: { name: 'Summit Gear Co.', lines: ['PO Box 4410', 'Christchurch 8140', 'New Zealand'], email: 'accounts@summitgear.example' },
  ship_to: { name: 'Summit Gear Co.', lines: ['118 Colombo Street', 'Christchurch 8023', 'New Zealand'], email: null },
  lines: [
    { name: 'Merino Crew Sock, Charcoal (M)', sku: 'SOC-MER-CH-M', qty: 24, unitPrice: 18.5, discount: 0, taxRate: 15, amount: 444 },
    { name: 'Trail Pack 28L, Olive', sku: 'PCK-TRL-28-OL', qty: 3, unitPrice: 189, discount: 0, taxRate: 15, amount: 567 },
    { name: 'Insulated Bottle 750ml', sku: 'BTL-INS-750', qty: 12, unitPrice: 34.9, discount: 10, taxRate: 15, amount: 376.92 },
    { name: 'Head Torch 300 Lumen', sku: 'TRC-HD-300', qty: 4, unitPrice: 59, discount: 0, taxRate: 15, amount: 236 },
    { name: 'Seam Sealer 250ml', sku: 'SLR-SEAM-250', qty: 10, unitPrice: 12.5, discount: 0, taxRate: 15, amount: 125 },
    { name: 'Repair Kit — Tent Pole', sku: 'RPK-TNT-01', qty: 5, unitPrice: 24, discount: 0, taxRate: 15, amount: 120 },
  ],
  costs: [
    { name: 'Freight', sub: 'NZ Post Courier · Overnight · 2 cartons', taxRate: 15, amount: 18 },
    { name: 'Handling fee', sub: 'Packing and dispatch', taxRate: 15, amount: 7.5 },
  ],
  items_subtotal: 1868.92, costs_subtotal: 25.5, discount_amount: 0, subtotal: 1894.42,
  taxes: [{ label: 'Tax 15%', rate: 15, amount: 284.16 }], tax_total: 284.16, total: 2178.58,
}]
