// src/app/api/integrations/xero/tax-rates/route.ts
// POST: copy the active tax rates from Xero into this organisation's tax rates (Settings → General). Admin only.
// Rates Inventa already has (same name) are left alone, so it is safe to run more than once.
import { NextResponse } from 'next/server'
import { guardXero } from '@/lib/xero/guard'
import { fetchXeroLists, loadInventaTaxRates } from '@/lib/xero/mapping'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()

export async function POST() {
  const g = await guardXero(true)
  if ('res' in g) return g.res

  const [lists, existing] = await Promise.all([fetchXeroLists(g.a.db, g.a.orgId), loadInventaTaxRates(g.a.db, g.a.orgId)])
  if (!lists.ok) return NextResponse.json({ error: lists.error }, { status: lists.status === 401 ? 409 : 502 })

  const haveNames = new Set(existing.map(r => norm(r.name)))
  const haveCodes = new Set(existing.map(r => (r.code ?? '').toLowerCase()).filter(Boolean))
  const toAdd: { org_id: string; name: string; code: string; rate: number; is_default: boolean }[] = []
  for (const x of lists.taxRates) {
    if (haveNames.has(norm(x.name)) || haveCodes.has(x.taxType.toLowerCase())) continue
    haveNames.add(norm(x.name)); haveCodes.add(x.taxType.toLowerCase())
    toAdd.push({ org_id: g.a.orgId, name: x.name.slice(0, 80), code: x.taxType.slice(0, 30), rate: x.rate, is_default: false })
  }

  let added = 0
  let failed = 0
  for (const row of toAdd) {
    const { error } = await g.a.db.from('tax_rates').insert(row)
    if (error) { failed++; console.error('xero tax rate import failed', error.message) } else added++
  }
  return NextResponse.json({ added, skipped: lists.taxRates.length - toAdd.length, failed })
}
