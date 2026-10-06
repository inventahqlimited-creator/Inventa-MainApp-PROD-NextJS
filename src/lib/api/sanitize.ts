// src/lib/api/sanitize.ts
// Keep request bodies to the columns a client is allowed to set, so nobody can
// overwrite org_id, ids, timestamps or system-calculated fields.

export const CONTACT_FIELDS = ['type','name','email','phone','address','city','country','notes','is_active','status','tier','terms','currency','tax_number','credit_limit','disc_type','disc_value','bill_name','bill_email','bill_phone','bill_street','bill_city','bill_postcode','bill_country','ship_name','ship_email','ship_phone','ship_street','ship_city','ship_postcode','ship_country','website','custom_fields','tax_rate','default_location','price_level_id'] as const
export const ADDRESS_FIELDS = ['label','contact_name','email','phone','street','city','postcode','country','sort_order'] as const
export const PRODUCT_FIELDS = ['name','sku','barcode','description','unit','cost_price','sell_price','tax_rate','tags','is_active','track_stock','low_stock_threshold','type','sell_uom','sell_uom_qty','buy_uom','buy_uom_qty','supplier_code','lead_time_days','min_order_qty','default_supplier_id','serial_tracking','batch_tracking','expiry_tracking','notes','custom_fields','images','attachments','buy_tax_rate_id','sell_tax_rate_id'] as const
export const LOCATION_FIELDS = ['name','type','address','city','country','is_default','active','bins','phone','email'] as const
export const TAX_RATE_FIELDS = ['code','name','rate','is_default'] as const
export const CURRENCY_FIELDS = ['code','name','symbol','rate','is_base'] as const

/** Returns a new object with only the allowed keys, or null if the body is not a plain object. */
export function pick(body: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const src = body as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]
  return out
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Checks that every linked id in `data` points at a row in the caller's own organisation.
 * `links` maps a field name to the table it refers to, e.g. { default_supplier_id: 'contacts' }.
 * Returns the name of the first bad field, or null if all are fine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function badForeignKey(db: any, orgId: string, data: Record<string, unknown>, links: Record<string, string>): Promise<string | null> {
  for (const [field, table] of Object.entries(links)) {
    const v = data[field]
    if (v === undefined || v === null || v === '') continue
    if (typeof v !== 'string' || !UUID_RE.test(v)) return field
    const { data: row } = await db.from(table).select('id').eq('id', v).eq('org_id', orgId).maybeSingle()
    if (!row) return field
  }
  return null
}

export const PRODUCT_LINKS = { default_supplier_id: 'contacts', buy_tax_rate_id: 'tax_rates', sell_tax_rate_id: 'tax_rates' }
export const CONTACT_LINKS = { price_level_id: 'price_levels' }
