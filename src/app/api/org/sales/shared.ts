// src/app/api/org/sales/shared.ts
// Shared helpers for the sales order API routes (mirrors the purchase order helpers).

const SO_FIELDS = [
  'customer_id', 'customer_name', 'location_id', 'location_name', 'status',
  'order_date', 'expected_date', 'ref', 'terms', 'notes',
  'currency', 'total_amount', 'order_discount', 'order_discount_type', 'order_discount_amount',
  'price_level_id', 'price_level_name',
] as const

export function pickSO(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of SO_FIELDS) if (body[k] !== undefined) out[k] = body[k]
  return out
}

const num = (v: unknown, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const str = (v: unknown) => (v == null || v === '' ? null : String(v))

export function lineRow(l: Record<string, unknown>, i: number) {
  return {
    product_id: l.product_id as string,
    product_name: str(l.product_name),
    product_sku: str(l.product_sku),
    unit: str(l.unit) ?? 'Each',
    quantity: num(l.quantity),
    unit_price: num(l.unit_price),
    discount: num(l.discount),
    tax_rate: num(l.tax_rate),
    tax_rate_id: str(l.tax_rate_id),
    tax_name: str(l.tax_name),
    line_notes: str(l.line_notes),
    sort_order: i,
    // total_price is a generated column in the DB — never send it
  }
}

export function costLineRow(l: Record<string, unknown>, i: number) {
  return {
    product_id: str(l.product_id),
    product_name: str(l.product_name),
    product_sku: str(l.product_sku),
    description: str(l.description),
    amount: num(l.amount),
    tax_rate: num(l.tax_rate),
    tax_rate_id: str(l.tax_rate_id),
    tax_name: str(l.tax_name),
    sort_order: i,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextSoNumber(adminClient: any, orgId: string): Promise<string> {
  const { data: org } = await adminClient
    .from('organisations')
    .select('so_prefix, so_suffix, so_start, so_digits')
    .eq('id', orgId)
    .single()
  const prefix: string = org?.so_prefix ?? 'SO-'
  const suffix: string = org?.so_suffix ?? ''
  const start: number = Number(org?.so_start) || 1
  const digits: number = Number(org?.so_digits) || 4

  const { data: existing, error } = await adminClient
    .from('sales_orders')
    .select('so_number')
    .eq('org_id', orgId)
    .not('so_number', 'is', null)
  if (error) throw new Error(error.message)

  let max = start - 1
  for (const row of (existing ?? []) as { so_number: string }[]) {
    let n = row.so_number
    if (prefix && n.startsWith(prefix)) n = n.slice(prefix.length)
    if (suffix && n.endsWith(suffix)) n = n.slice(0, -suffix.length)
    const v = parseInt(n, 10)
    if (/^\d+$/.test(n) && v > max) max = v
  }
  return `${prefix}${String(max + 1).padStart(digits, '0')}${suffix}`
}
