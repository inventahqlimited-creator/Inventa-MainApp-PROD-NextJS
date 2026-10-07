// src/lib/pdf/engine.ts
// Pure-JavaScript PDF generation (pdfmake): no browser, tens of milliseconds per document, safe to run on the app server.
// Everything the documents need (fonts, logo) is embedded; nothing is fetched from the network except the organisation's
// own logo, and only from our own storage.
import pdfmake from 'pdfmake'
import type { Content, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces'

let ready = false

function init() {
  if (ready) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string>
  const fsys = (pdfmake as unknown as { virtualfs: { writeFileSync(name: string, content: string, enc: string): void } }).virtualfs
  for (const [name, b64] of Object.entries(vfs)) fsys.writeFileSync(name, b64, 'base64')
  const fonts: TFontDictionary = {
    Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
  }
  pdfmake.addFonts(fonts)
  // documents never need to read files or URLs themselves — images are passed in as data
  pdfmake.setUrlAccessPolicy(() => false)
  pdfmake.setLocalAccessPolicy(() => false)
  ready = true
}

export const COLORS = { ink: '#1C1F24', mut: '#6B7280', line: '#DADDE1', tint: '#F4F5F6', acc: '#3D5A6C' }

export async function buildPdf(def: TDocumentDefinitions): Promise<Buffer> {
  init()
  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [34, 34, 34, 48],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COLORS.ink, lineHeight: 1.25 },
    ...def,
  }
  const buf = await pdfmake.createPdf(doc).getBuffer()
  return Buffer.from(buf)
}

/** "Page 1 of 3" footer used by every document. */
export const pageFooter = (label?: string): TDocumentDefinitions['footer'] => (page, pages) => ({
  margin: [34, 14, 34, 0],
  columns: [
    { text: label ?? '', color: COLORS.mut, fontSize: 7.5 },
    { text: `Page ${page} of ${pages}`, alignment: 'right', color: COLORS.mut, fontSize: 7.5 },
  ],
})

/** Small grey uppercase label. */
export const lbl = (text: string, extra: Partial<Content & object> = {}): Content =>
  ({ text: text.toUpperCase(), fontSize: 6.5, bold: true, color: COLORS.mut, characterSpacing: 0.8, margin: [0, 0, 0, 3], ...extra }) as Content

// ── logo ──
export type Logo = { image: string } | { svg: string } | null

/**
 * The organisation's logo, fetched once and embedded. Only https addresses on our own storage host are fetched,
 * with a short timeout and a size cap; anything else (or any failure) just means the PDF is made without a logo.
 */
export async function loadLogo(url: string | null | undefined): Promise<Logo> {
  if (!url) return null
  try {
    if (url.startsWith('data:image/')) {
      const m = /^data:(image\/(?:png|jpeg|jpg|svg\+xml));base64,(.+)$/.exec(url)
      if (!m || m[2].length > 3_000_000) return null
      return m[1] === 'image/svg+xml' ? { svg: Buffer.from(m[2], 'base64').toString('utf8') } : { image: url }
    }
    const u = new URL(url)
    const storageHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : ''
    if (u.protocol !== 'https:' || !storageHost || u.host !== storageHost) return null
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 4000)
    const res = await fetch(u, { signal: ctl.signal }).finally(() => clearTimeout(t))
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > 2_000_000) return null
    if (type === 'image/svg+xml') return { svg: bytes.toString('utf8') }
    if (type === 'image/png' || type === 'image/jpeg') return { image: `data:${type};base64,${bytes.toString('base64')}` }
    return null
  } catch { return null }
}

export const logoContent = (logo: Logo, maxW = 150, maxH = 44): Content | null => {
  if (!logo) return null
  return 'svg' in logo
    ? ({ svg: logo.svg, fit: [maxW, maxH], margin: [0, 0, 0, 6] } as Content)
    : ({ image: logo.image, fit: [maxW, maxH], margin: [0, 0, 0, 6] } as Content)
}

// ── formatting ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDate(d: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}
export const qtyText = (n: number) => String(Math.round(n * 1000) / 1000)
export const moneyFn = (dp: number) => (n: number) => new Intl.NumberFormat('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)
export const todayIn = (tz: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** File-name safe version of a document number. */
export const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'document'
