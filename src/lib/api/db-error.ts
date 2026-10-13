// src/lib/api/db-error.ts
// Turns a database error from a save into a message a customer can act on, instead of "Could not save".

type DbErr = { code?: string; message?: string; details?: string | null } | null | undefined

const LABELS: Record<string, string> = {
  sku: 'product number (SKU)', name: 'name', email: 'email address', barcode: 'barcode', code: 'code',
  so_number: 'order number', po_number: 'order number', invoice_number: 'invoice number', number: 'number',
  tr_number: 'transfer number', adj_number: 'adjustment number', serial_number: 'serial number', batch_number: 'batch number',
  phone: 'phone number', tax_number: 'tax number', currency_code: 'currency', abbreviation: 'abbreviation', rate: 'rate',
}

/** "Key (org_id, sku)=(abc, X1) already exists." → { field: 'product number (SKU)', value: 'X1' } */
function parseKey(details?: string | null): { field: string | null; value: string | null } {
  const m = /Key \(([^)]+)\)=\(([^)]*)\)/.exec(details ?? '')
  if (!m) return { field: null, value: null }
  const cols = m[1].split(',').map(s => s.trim())
  const vals = m[2].split(',').map(s => s.trim())
  const i = cols.findIndex(c => c !== 'org_id' && c !== 'location_id' && c !== 'product_id')
  if (i < 0) return { field: null, value: null }
  const col = cols[i].replace(/^lower\((.*)\)$/, '$1')
  return { field: LABELS[col] ?? col.replace(/_/g, ' '), value: vals[i] ?? null }
}

/** What went wrong, in plain words, plus a sensible HTTP status. `noun` is e.g. "product" or "contact". */
export function saveError(error: DbErr, noun: string): { message: string; status: number } {
  const code = error?.code ?? ''
  const msg = error?.message ?? ''
  if (code === '23505' || /duplicate key/i.test(msg)) {
    const { field, value } = parseKey(error?.details)
    if (field && value) return { message: `There’s already a ${noun} with the ${field} “${value}”. Please use a different ${field}.`, status: 409 }
    if (field) return { message: `There’s already a ${noun} with that ${field}. Please use a different one.`, status: 409 }
    return { message: `A ${noun} with these details already exists. Please change them and try again.`, status: 409 }
  }
  if (code === '23503') return { message: `This ${noun} is linked to something that no longer exists. Please refresh the page and try again.`, status: 409 }
  if (code === '23502') return { message: `Some required details for this ${noun} are missing. Please fill in everything marked * and try again.`, status: 400 }
  if (code === '22001') return { message: `One of the values is too long. Please shorten it and try again.`, status: 400 }
  if (code === '22P02' || code === '22003' || code === '23514') return { message: `One of the values isn’t valid for this ${noun} (for example a number out of range). Please check and try again.`, status: 400 }
  return { message: `We couldn’t save this ${noun} just now. Please try again in a moment — if it keeps happening, contact us and we’ll sort it out.`, status: 500 }
}
