// src/lib/kits/import.ts — bulk import of kit Bills of Materials from a CSV file (no database access: checked here, applied by the API).
//   One row per item in a kit:  Kit SKU, Component SKU, Quantity, Unit (optional).
//   • The kit must already exist as a Non Stock item with no stock on hand; the import turns its kit flag on.
//   • Importing a kit replaces its whole list of items with the rows in the file.
//   • A kit with any problem row is skipped as a whole, so a kit is never left half built.
import { MAX_BOM_LINES } from './bom'

export const IMPORT_HEADERS = ['Kit SKU', 'Component SKU', 'Quantity', 'Unit'] as const
export const MAX_IMPORT_ROWS = 5000

export function templateCsv(): string {
  return [
    IMPORT_HEADERS.join(','),
    'GIFT-BOX-01,CHOC-250,2,Each',
    'GIFT-BOX-01,CARD-GREET,1,Each',
    'GIFT-BOX-01,WRAP-SVC,1,Each',
    'STARTER-PACK,PUMP-01,1,',
    'STARTER-PACK,HOSE-2M,2,',
  ].join('\r\n') + '\r\n'
}

/** Reads CSV text: quotes, doubled quotes, commas and line breaks inside quotes, a leading byte-order mark, \r\n or \n */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

export type ImportRow = { line: number; kitSku: string; compSku: string; qty: string; unit: string }
export type ReadResult = { ok: true; rows: ImportRow[] } | { ok: false; error: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const WANT: Record<string, keyof Omit<ImportRow, 'line'>> = { kitsku: 'kitSku', kit: 'kitSku', componentsku: 'compSku', component: 'compSku', itemsku: 'compSku', quantity: 'qty', qty: 'qty', unit: 'unit', uom: 'unit', unitofmeasure: 'unit' }

export function readImportRows(text: string): ReadResult {
  const grid = parseCsv(text)
  if (grid.length === 0) return { ok: false, error: 'The file is empty. Download the template, fill it in and upload it again.' }
  const cols: Partial<Record<keyof Omit<ImportRow, 'line'>, number>> = {}
  grid[0].forEach((h, i) => { const k = WANT[norm(h)]; if (k && cols[k] === undefined) cols[k] = i })
  if (cols.kitSku === undefined || cols.compSku === undefined || cols.qty === undefined) {
    return { ok: false, error: 'The first row must have the column names “Kit SKU”, “Component SKU” and “Quantity” (and optionally “Unit”). Download the template to see the layout.' }
  }
  if (grid.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: `The file has more than ${MAX_IMPORT_ROWS} rows. Please split it into smaller files.` }
  const get = (r: string[], k: keyof Omit<ImportRow, 'line'>) => (cols[k] === undefined ? '' : (r[cols[k] as number] ?? '').trim())
  const rows = grid.slice(1).map((r, i) => ({ line: i + 2, kitSku: get(r, 'kitSku'), compSku: get(r, 'compSku'), qty: get(r, 'qty'), unit: get(r, 'unit') }))
  if (rows.length === 0) return { ok: false, error: 'The file has column names but no rows.' }
  return { ok: true, rows }
}

export type ImportProduct = { id: string; name: string; sku: string | null; type: string | null; is_kit: boolean; is_active: boolean; unit: string | null; hasStock: boolean }
export type RowResult = { line: number; kitSku: string; compSku: string; status: 'ok' | 'error' | 'skipped'; message: string }
export type PlannedKit = { kitId: string; sku: string; name: string; wasKit: boolean; lines: { component_id: string; quantity: number }[] }

const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

export function planKitImport(rows: ImportRow[], products: ImportProduct[]): { results: RowResult[]; kits: PlannedKit[] } {
  const bySku = new Map<string, ImportProduct>()
  for (const p of products) if (p.sku && !bySku.has(p.sku.trim().toLowerCase())) bySku.set(p.sku.trim().toLowerCase(), p)
  const find = (sku: string) => bySku.get(sku.trim().toLowerCase())

  // rows of each kit, in file order
  const groups = new Map<string, ImportRow[]>()
  for (const r of rows) {
    const k = r.kitSku.trim().toLowerCase()
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const kitSkusInFile = new Set([...groups.keys()].filter(k => k && find(k)))

  const results = new Map<number, RowResult>()
  const kits: PlannedKit[] = []
  const put = (r: ImportRow, status: RowResult['status'], message: string) => results.set(r.line, { line: r.line, kitSku: r.kitSku, compSku: r.compSku, status, message })

  for (const [key, list] of groups) {
    if (!key) { list.forEach(r => put(r, 'error', 'Kit SKU is empty. Enter the SKU of the kit this item belongs to.')); continue }
    const kit = find(key)
    const errors = new Map<number, string>()
    const kitProblem = !kit ? `No product with the SKU “${list[0].kitSku}” was found. Create the kit as a product first.`
      : kit.type !== 'NonStock' ? `“${kit.name}” isn’t a Non Stock item. Change the stock type to Non Stock first, then import again.`
      : kit.hasStock ? `“${kit.name}” has stock on hand. A kit can’t hold stock — adjust its stock to zero first, then import again.`
      : !kit.is_active ? `“${kit.name}” is inactive. Make it active first.`
      : null
    if (kitProblem) { list.forEach(r => errors.set(r.line, kitProblem)); }

    const seen = new Set<string>()
    const lines: { component_id: string; quantity: number }[] = []
    for (const r of list) {
      if (errors.has(r.line)) continue
      const comp = r.compSku ? find(r.compSku) : undefined
      let err: string | null = null
      if (!r.compSku) err = 'Component SKU is empty.'
      else if (!comp) err = `No product with the SKU “${r.compSku}” was found.`
      else if (kit && comp.id === kit.id) err = 'A kit can’t contain itself.'
      else if (comp.is_kit || kitSkusInFile.has(r.compSku.trim().toLowerCase())) err = `“${comp.name}” is a kit, and kits can’t contain other kits.`
      else if (!comp.is_active) err = `“${comp.name}” is inactive. Make it active or remove this row.`
      else if (seen.has(comp.id)) err = `“${comp.name}” is listed twice for this kit. Combine the quantities into one row.`
      if (!err) {
        const q = Number(r.qty.replace(/,/g, ''))
        if (r.qty === '' || !Number.isFinite(q) || q <= 0) err = `Quantity “${r.qty}” isn’t valid. Enter a number greater than zero.`
        else if (q > 1_000_000) err = 'Quantity is too large.'
        else if (r.unit && comp && comp.unit && r.unit.trim().toLowerCase() !== comp.unit.trim().toLowerCase()) err = `Unit “${r.unit}” doesn’t match “${comp.name}”, which is counted in “${comp.unit}”. Use “${comp.unit}” or leave Unit blank.`
        else if (comp) { seen.add(comp.id); lines.push({ component_id: comp.id, quantity: r4(q) }) }
      }
      if (err) errors.set(r.line, err)
    }
    if (!errors.size && lines.length > MAX_BOM_LINES) list.forEach(r => errors.set(r.line, `A kit can have up to ${MAX_BOM_LINES} items.`))

    if (errors.size) {
      for (const r of list) {
        const e = errors.get(r.line)
        if (e) put(r, 'error', e)
        else put(r, 'skipped', `Not imported: another row for kit ${list[0].kitSku} has a problem. Fix it and import this kit again.`)
      }
    } else if (kit) {
      for (const r of list) put(r, 'ok', kit.is_kit ? 'Ready: replaces the kit’s existing items.' : 'Ready: will be made a kit.')
      kits.push({ kitId: kit.id, sku: kit.sku ?? list[0].kitSku, name: kit.name, wasKit: kit.is_kit, lines })
    }
  }
  return { results: rows.map(r => results.get(r.line) as RowResult), kits }
}
