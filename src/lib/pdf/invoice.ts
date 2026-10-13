// src/lib/pdf/invoice.ts
// Invoice, quote and purchase order as a PDF (pure JavaScript). Mirrors src/lib/invoice/render.ts: the same layout
// toggles (InvoiceConfig), wording and totals; purchase orders use the same layout with their own labels.
import { dueDateFor, type PaymentTerm } from '@/lib/payment-terms'
import type { Content, TableCell } from 'pdfmake/interfaces'
import type { InvoiceAddress, InvoiceBusiness, InvoiceOrder, InvoicePayload } from '@/lib/invoice/types'
import type { InvoiceConfig } from '@/lib/invoice/config'
import { setDocQty } from '@/lib/qty'
import { COLORS, buildPdf, fmtDate, lbl, loadLogo, logoContent, moneyFn, pageFooter, qtyText, numText, safeName, todayIn, type Logo } from './engine'

const dash = '—'

let DOC_TERMS: PaymentTerm[] = []
/** Due date from the organisation's payment terms (Net 14, 20th of next month …); null when the term is unknown. */
function dueDate(terms: string | null, invoiceDate: string): string | null {
  return dueDateFor(terms, invoiceDate, DOC_TERMS)
}

export function documentTitle(o: InvoiceOrder, biz: InvoiceBusiness): string {
  return o.kind === 'purchase' ? 'Purchase Order' : o.is_quote ? 'Quote' : biz.numbers.some(n => n.startsWith('Tax no.')) ? 'Tax Invoice' : 'Invoice'
}

const addr = (label: string, a: InvoiceAddress | null): Content => ({
  stack: [
    lbl(label),
    { text: a?.name || dash, bold: true, fontSize: 10.5, margin: [0, 0, 0, 2] },
    ...(a?.lines.length ? [{ text: a.lines.join('\n'), lineHeight: 1.35 }] : []),
    ...(a?.email ? [{ text: a.email, color: COLORS.mut, fontSize: 8.5, margin: [0, 3, 0, 0] }] : []),
  ] as Content[],
})

function infoRow(o: InvoiceOrder, cfg: InvoiceConfig, invoiceDate: string): Content | null {
  const d = cfg.details
  const po = o.kind === 'purchase'
  const due = dueDate(o.terms, invoiceDate)
  const kv = [
    d.invoiceDate ? [po ? 'Order date' : o.is_quote ? 'Quote date' : 'Invoice date', fmtDate(invoiceDate)] : null,
    po
      ? (d.dueDate ? ['Expected delivery', o.due_date ? fmtDate(o.due_date) : dash] : null)
      : (d.dueDate && !o.is_quote ? ['Due date', due ? fmtDate(due) : dash] : null),
    d.terms ? ['Terms', o.terms ?? dash] : null,
    d.orderNumber ? ['Order #', o.so_number] : null,
    d.customerPo && o.customer_po ? [po ? 'Supplier ref' : 'Customer PO', o.customer_po] : null,
    ...(po || o.is_quote ? [] : [
      d.carrier && o.carrier ? ['Carrier', o.carrier] : null,
      d.shippingMethod && o.shipping_method ? ['Shipping method', o.shipping_method] : null,
      d.serviceType && o.service_type ? ['Service', o.service_type] : null,
      d.trackingNumber && o.tracking_number ? ['Tracking number', o.tracking_number] : null,
    ]),
  ].filter((x): x is string[] => !!x)
  const cols: Content[] = []
  if (cfg.addresses.billTo) cols.push(addr(po ? 'Supplier' : 'Bill to', o.bill_to))
  if (cfg.addresses.shipTo) cols.push(addr(po ? 'Deliver to' : 'Ship to', o.ship_to))
  if (kv.length) {
    cols.push({
      stack: [lbl(po ? 'Order details' : 'Invoice details'), {
        table: { widths: ['auto', '*'], body: kv.map(([k, v]) => [{ text: k, color: COLORS.mut, border: [false, false, false, false] }, { text: v, bold: true, alignment: 'right', border: [false, false, false, false] }] as TableCell[]) },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 2, paddingBottom: () => 2 },
      }] as Content[],
    })
  }
  return cols.length ? { columns: cols, columnGap: 22, margin: [0, 0, 0, 16] } : null
}

function lineTable(o: InvoiceOrder, cfg: InvoiceConfig, money: (n: number) => string): Content {
  const po = o.kind === 'purchase'
  const cols = [
    cfg.columns.unitPrice ? { key: 'unitPrice', label: po ? 'Unit cost' : 'Unit price', w: 62 } : null,
    cfg.columns.discount ? { key: 'discount', label: 'Disc.', w: 38 } : null,
    cfg.columns.tax ? { key: 'tax', label: 'Tax', w: 38 } : null,
  ].filter((c): c is { key: string; label: string; w: number } => !!c)
  const track = po ? [] : ([
    cfg.columns.serial ? { key: 'serial', label: 'Serial #', w: 82 } : null,
    cfg.columns.batch ? { key: 'batch', label: 'Batch', w: 56 } : null,
    cfg.columns.expiry ? { key: 'expiry', label: 'Expiry', w: 52 } : null,
  ].filter((c): c is { key: string; label: string; w: number } => !!c))
  const th = (t: string, right = false): TableCell => ({ text: t.toUpperCase(), fontSize: 6.5, bold: true, color: COLORS.mut, characterSpacing: 0.7, fillColor: COLORS.tint, alignment: right ? 'right' : 'left', margin: [0, 2, 0, 2] })
  const head: TableCell[] = [th('Description'), ...track.map(t => th(t.label)), th('Qty', true), ...cols.map(c => th(c.label, true)), th('Amount', true)]
  const desc = (name: string, sub: string): TableCell => ({ stack: [{ text: name, bold: true, fontSize: 9.5 }, ...(sub ? [{ text: sub, color: COLORS.mut, fontSize: 7.5, margin: [0, 1, 0, 0] }] : [])] as Content[] })
  const num = (t: string, bold = false): TableCell => ({ text: t, alignment: 'right', bold, noWrap: true })

  const body: TableCell[][] = [head]
  for (const l of o.lines) {
    body.push([
      desc(l.name, cfg.columns.sku ? l.sku : ''),
      ...track.map((t): TableCell => {
        const v = t.key === 'serial' ? l.serials : t.key === 'batch' ? l.batches : (l.expiries ?? []).map(fmtDate)
        return { text: (v ?? []).length ? (v ?? []).join('\n') : dash, fontSize: 7.5, color: (v ?? []).length ? COLORS.ink : COLORS.mut }
      }),
      num(qtyText(l.qty)),
      ...cols.map(c => num(c.key === 'unitPrice' ? money(l.unitPrice) : c.key === 'discount' ? (l.discount ? `${numText(l.discount)}%` : dash) : `${numText(l.taxRate)}%`)),
      num(money(l.amount), true),
    ])
  }
  if (o.costs.length) {
    body.push([{ text: 'ADDITIONAL COSTS', colSpan: 3 + cols.length + track.length, fontSize: 6.5, bold: true, color: COLORS.mut, characterSpacing: 0.7, fillColor: COLORS.tint, margin: [0, 2, 0, 2] }, ...Array(2 + cols.length + track.length).fill({})])
    for (const c of o.costs) {
      body.push([desc(c.name, c.sub), ...track.map((): TableCell => ({ text: '' })), num(''), ...cols.map(col => num(col.key === 'tax' ? `${numText(c.taxRate)}%` : '')), num(money(c.amount), true)])
    }
  }
  return {
    table: { headerRows: 1, dontBreakRows: true, widths: ['*', ...track.map(t => t.w), 34, ...cols.map(c => c.w), 70], body },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 ? 0.9 : i === node.table.body.length ? 0.5 : 0.5),
      hLineColor: (i: number) => (i === 0 ? COLORS.ink : COLORS.line),
      vLineWidth: () => 0,
      paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 5, paddingBottom: () => 5,
    },
  }
}

function leftColumn(o: InvoiceOrder, cfg: InvoiceConfig): Content {
  const c = cfg.content
  const bank = [['Bank', c.bankName], ['Account name', c.accountName], ['Account number', c.accountNumber]].filter(([, v]) => v)
  const stack: Content[] = []
  if (cfg.footer.paymentDetails && bank.length && !o.is_quote && !o.kind) {
    stack.push({
      table: {
        widths: ['*'],
        body: [[{
          stack: [lbl('Payment details'), {
            table: { widths: ['auto', '*'], body: [...bank, ['Reference', o.invoice_number]].map(([k, v]) => [{ text: k, color: COLORS.mut, border: [false, false, false, false] }, { text: v, border: [false, false, false, false] }] as TableCell[]) },
            layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 8, paddingTop: () => 1.5, paddingBottom: () => 1.5 },
          }] as Content[],
        }]],
      },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => COLORS.line, vLineColor: () => COLORS.line, paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 8, paddingBottom: () => 8 },
      margin: [0, 0, 0, 12],
    })
  }
  const notes = [o.notes, c.notes].filter(Boolean).join('\n\n')
  if (cfg.footer.notes && notes) stack.push({ stack: [lbl('Notes'), { text: notes, color: '#374151', lineHeight: 1.4 }] as Content[] })
  return stack.length ? { stack } : { text: '' }
}

function totalsColumn(o: InvoiceOrder, money: (n: number) => string): Content {
  const breakdown = o.costs.length > 0 || o.discount_amount > 0
  const rows: { label: string; value: string; muted?: boolean; strong?: boolean }[] = [
    ...(breakdown ? [{ label: 'Items subtotal', value: money(o.items_subtotal), muted: true }] : []),
    ...(o.costs.length ? [{ label: 'Additional costs', value: money(o.costs_subtotal), muted: true }] : []),
    ...(o.discount_amount > 0 ? [{ label: 'Discount', value: `−${money(o.discount_amount)}`, muted: true }] : []),
    { label: 'Subtotal (excl. tax)', value: money(o.subtotal) },
    ...(o.taxes.length ? o.taxes.map(t => ({ label: t.label, value: money(t.amount), muted: true })) : [{ label: 'Tax', value: money(0), muted: true }]),
    { label: `Total ${o.currency}`, value: money(o.total), strong: true },
  ]
  const dueLabel = o.kind === 'purchase' ? 'Total' : o.is_quote ? 'Quote total' : 'Amount due'
  return {
    stack: [
      {
        table: { widths: ['*', 'auto'], body: rows.map(r => [
          { text: r.label, color: r.muted ? COLORS.mut : COLORS.ink, bold: !!r.strong, fontSize: r.strong ? 10 : 9 },
          { text: r.value, alignment: 'right', bold: !r.muted, fontSize: r.strong ? 10 : 9, noWrap: true },
        ] as TableCell[]) },
        layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => COLORS.line, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 4.5, paddingBottom: () => 4.5 },
      },
      {
        margin: [0, 10, 0, 0],
        table: {
          widths: ['*', 'auto'],
          body: [[
            { text: dueLabel.toUpperCase(), color: '#FFFFFF', fontSize: 7, bold: true, characterSpacing: 0.8, margin: [0, 6, 0, 0] },
            { text: `${o.currency} ${money(o.total)}`, color: '#FFFFFF', fontSize: 15, bold: true, alignment: 'right', noWrap: true },
          ]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => COLORS.acc, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 9, paddingBottom: () => 9 },
      },
    ] as Content[],
  }
}

export async function renderInvoicePdf(payload: InvoicePayload, orderIndex = 0, now?: Date): Promise<{ filename: string; buffer: Buffer }> {
  const o = payload.orders[orderIndex]
  if (!o) throw new Error('Order not found')
  const { business: biz, config: cfg } = payload
  const money = moneyFn(payload.decimals)
  const invoiceDate = o.invoice_date ?? todayIn(payload.timezone, now)
  const logo: Logo = cfg.header.logo ? await loadLogo(biz.logo_url) : null
  setDocQty(payload.qty)
  DOC_TERMS = payload.paymentTerms ?? []
  const title = documentTitle(o, biz)

  const contact = [biz.address.join(', '), [biz.phone, biz.email].filter(Boolean).join(' · '), biz.numbers.join(' · ')].filter(Boolean)
  const mast: Content = {
    columns: [
      {
        width: '*',
        stack: [
          ...(logoContent(logo) ? [logoContent(logo) as Content] : []),
          ...(cfg.header.businessDetails && biz.name ? [{ text: biz.name, bold: true, fontSize: 12 } as Content] : []),
          ...(cfg.header.businessDetails && contact.length ? [{ text: contact.join('\n'), color: COLORS.mut, fontSize: 8, lineHeight: 1.4, margin: [0, 2, 0, 0] } as Content] : []),
        ],
      },
      {
        width: 'auto',
        stack: [
          { text: title.toUpperCase(), alignment: 'right', fontSize: 22, color: COLORS.acc, characterSpacing: 0.5 },
          { text: o.invoice_number, alignment: 'right', bold: true, fontSize: 11, margin: [0, 6, 0, 0] },
        ],
      },
    ],
    margin: [0, 0, 0, 18],
  }

  const info = infoRow(o, cfg, invoiceDate)
  const buffer = await buildPdf({
    info: { title: `${title} ${o.invoice_number}`, author: biz.name || undefined },
    footer: pageFooter(biz.name),
    content: [
      mast,
      ...(info ? [info] : []),
      lineTable(o, cfg, money),
      {
        unbreakable: true,
        margin: [0, 16, 0, 0],
        columns: [{ width: '*', stack: [leftColumn(o, cfg)] }, { width: 215, stack: [totalsColumn(o, money)] }],
        columnGap: 28,
      },
    ],
  })
  return { filename: `${safeName(`${title.replace(/\s+/g, '-')}-${o.invoice_number}`)}.pdf`, buffer }
}
