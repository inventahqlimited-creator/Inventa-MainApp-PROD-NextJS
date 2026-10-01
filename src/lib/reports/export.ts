// src/lib/reports/export.ts
// Formatting plus CSV / Excel / Print-to-PDF for any report. Runs in the browser; no extra packages needed.
import type { Col, Row } from './registry'

// ───────────── display formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(v: unknown): string {
  const s = v ? String(v).slice(0, 10) : ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : s
}

const num = (n: number, max: number) => n.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: max })

export function fmtValue(col: Col, v: unknown): string {
  if (v === null || v === undefined || v === '') return col.type === 'blank' ? '' : '—'
  switch (col.type) {
    case 'money': return `${Number(v) < 0 ? '-' : ''}$${Math.abs(Number(v)).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'pct': return `${num(Number(v), 1)}%`
    case 'qty': return num(Number(v), 4)
    case 'num': return num(Number(v), 2)
    case 'date': return fmtDate(v)
    default: return String(v)
  }
}

export function fmtTile(value: number | string, type: 'num' | 'money' | 'text' | 'pct'): string {
  if (typeof value === 'string') return value
  return fmtValue({ key: '', label: '', type: type === 'text' ? 'text' : type }, value)
}

export const isNumeric = (c: Col) => c.type === 'money' || c.type === 'qty' || c.type === 'num' || c.type === 'pct'

export function totals(cols: Col[], rows: Row[]): Record<string, number> {
  const t: Record<string, number> = {}
  for (const c of cols) if (c.sum) t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)
  return t
}

// ───────────── CSV
export function toCsv(cols: Col[], rows: Row[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.map(c => esc(c.label)).join(',')]
  for (const r of rows) lines.push(cols.map(c => esc(c.type === 'blank' ? '' : r[c.key])).join(','))
  return '﻿' + lines.join('\r\n')
}

// ───────────── Excel (.xlsx) — a minimal writer: XML parts in an uncompressed zip
const enc = new TextEncoder()
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

let CRC: Uint32Array | null = null
function crc32(buf: Uint8Array): number {
  if (!CRC) {
    CRC = new Uint32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0 }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true)
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true)
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true)
    parts.push(new Uint8Array(lh.buffer), name, f.data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true)
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true)
    ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true)
    ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of all) { out.set(p, o); o += p.length }
  return out
}

const colName = (i: number): string => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const serial = (ymd: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null
}

// cell styles (indexes into cellXfs below)
const S = { head: 1, money: 2, pct: 3, date: 4, title: 5, sub: 6, totText: 7, totMoney: 8, totNum: 9 }

export function buildXlsx(opts: { title: string; subtitle: string[]; cols: Col[]; rows: Row[] }): Uint8Array {
  const { title, subtitle, cols, rows } = opts
  const tot = totals(cols, rows)
  const hasTotals = Object.keys(tot).length > 0
  const subRows = subtitle.length
  const headRow = 3 + subRows
  const cell = (c: number, r: number, v: unknown, style = 0, kind: 'auto' | 'str' = 'auto'): string => {
    const ref = `${colName(c)}${r}`
    if (v === null || v === undefined || v === '') return style ? `<c r="${ref}" s="${style}"/>` : ''
    if (kind === 'auto' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`
    return `<c r="${ref}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`
  }
  const sheetRows: string[] = []
  sheetRows.push(`<row r="1" ht="24" customHeight="1">${cell(0, 1, title, S.title)}</row>`)
  subtitle.forEach((t, i) => sheetRows.push(`<row r="${2 + i}">${cell(0, 2 + i, t, S.sub)}</row>`))
  sheetRows.push(`<row r="${headRow}" ht="22" customHeight="1">${cols.map((c, i) => cell(i, headRow, c.label, S.head, 'str') || `<c r="${colName(i)}${headRow}" s="${S.head}"/>`).join('')}</row>`)
  rows.forEach((r, ri) => {
    const rn = headRow + 1 + ri
    const cells = cols.map((c, ci) => {
      const v = c.type === 'blank' ? null : r[c.key]
      if (c.type === 'money') return cell(ci, rn, v === null ? null : Number(v), S.money)
      if (c.type === 'pct') return cell(ci, rn, v === null ? null : Number(v), S.pct)
      if (c.type === 'qty' || c.type === 'num') return cell(ci, rn, v === null ? null : Number(v))
      if (c.type === 'date') { const s = v ? serial(String(v)) : null; return s === null ? cell(ci, rn, v, 0, 'str') : cell(ci, rn, s, S.date) }
      return cell(ci, rn, v, 0, 'str')
    }).join('')
    sheetRows.push(`<row r="${rn}">${cells}</row>`)
  })
  const lastData = headRow + rows.length
  if (hasTotals) {
    const rn = lastData + 1
    const cells = cols.map((c, ci) => {
      if (ci === 0) return cell(ci, rn, 'Total', S.totText, 'str')
      if (c.sum) return cell(ci, rn, tot[c.key], c.type === 'money' ? S.totMoney : S.totNum)
      return `<c r="${colName(ci)}${rn}" s="${S.totText}"/>`
    }).join('')
    sheetRows.push(`<row r="${rn}">${cells}</row>`)
  }
  const widths = cols.map(c => {
    const longest = Math.max(c.label.length, ...rows.slice(0, 500).map(r => fmtValue(c, r[c.key]).length))
    return Math.min(Math.max(longest + 2, 9), 48)
  })
  const lastCol = colName(Math.max(cols.length - 1, 0))
  const sheetName = (title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report')

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows.join('')}</sheetData>${rows.length ? `<autoFilter ref="A${headRow}:${lastCol}${lastData}"/>` : ''}</worksheet>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="165" formatCode="dd\\ mmm\\ yyyy"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF0F2D35"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0D9488"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="4" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

  const lastRef = hasTotals ? lastData : lastData
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>${rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlEsc(sheetName)}'!$A$${headRow}:$${lastCol}$${lastRef}</definedName></definedNames>` : ''}</workbook>`
  const files = [
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { name: 'xl/styles.xml', data: enc.encode(styles) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
  ]
  return zip(files)
}

// ───────────── browser helpers
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const fileSafe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()

const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Opens a clean, print-ready copy of the report in a new tab and starts the print dialog (choose "Save as PDF" there). */
export function printReport(opts: { org: string; title: string; subtitle: string[]; cols: Col[]; rows: Row[]; note?: string }): boolean {
  const { org, title, subtitle, cols, rows, note } = opts
  const w = window.open('', '_blank')
  if (!w) return false
  const tot = totals(cols, rows)
  const hasTotals = Object.keys(tot).length > 0
  const head = cols.map(c => `<th class="${isNumeric(c) ? 'r' : ''}">${htmlEsc(c.label)}</th>`).join('')
  const body = rows.map(r => `<tr>${cols.map(c => {
    const cls = [isNumeric(c) ? 'r' : '', c.type === 'blank' ? 'blank' : ''].filter(Boolean).join(' ')
    return `<td class="${cls}">${htmlEsc(c.type === 'blank' ? '' : fmtValue(c, r[c.key]))}</td>`
  }).join('')}</tr>`).join('')
  const foot = hasTotals ? `<tfoot><tr>${cols.map((c, i) => `<td class="${isNumeric(c) ? 'r' : ''}">${i === 0 ? 'Total' : c.sum ? htmlEsc(fmtValue(c, tot[c.key])) : ''}</td>`).join('')}</tr></tfoot>` : ''
  const when = new Date().toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(title)}</title><style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Inter, Arial, sans-serif; color: #0F2D35; margin: 0; font-size: 10.5px; }
    .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0D9488; padding-bottom: 8px; margin-bottom: 10px; }
    h1 { font-size: 19px; margin: 0; letter-spacing: -0.02em; } .org { font-size: 11px; color: #6B7280; font-weight: 600; margin-bottom: 2px; }
    .meta { font-size: 10px; color: #6B7280; text-align: right; line-height: 1.5; } .filters { font-size: 10px; color: #4B5563; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; } tfoot { display: table-footer-group; }
    th { background: #0D9488; color: #fff; text-align: left; padding: 6px 7px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 5px 7px; border-bottom: 1px solid #E5E7EB; vertical-align: top; } tr { page-break-inside: avoid; }
    tbody tr:nth-child(even) td { background: #F8FAFA; } .r { text-align: right; white-space: nowrap; }
    td.blank { border: 1px solid #9CA3AF; min-width: 70px; height: 22px; background: #fff !important; }
    tfoot td { font-weight: 700; border-top: 2px solid #0F2D35; background: #F3F4F6; } .note { margin-top: 10px; font-size: 9.5px; color: #6B7280; }
    th, tfoot td, tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body>
    <div class="top"><div><div class="org">${htmlEsc(org)}</div><h1>${htmlEsc(title)}</h1></div><div class="meta">Generated ${htmlEsc(when)}<br>${rows.length} row${rows.length === 1 ? '' : 's'}</div></div>
    ${subtitle.length ? `<p class="filters">${subtitle.map(htmlEsc).join(' &nbsp;·&nbsp; ')}</p>` : ''}
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
    ${note ? `<div class="note">${htmlEsc(note)}</div>` : ''}
  </body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch { /* user can print manually */ } }, 350)
  return true
}
