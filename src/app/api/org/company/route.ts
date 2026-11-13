// src/app/api/org/company/route.ts — Settings → General → Business Details.
import { NextResponse } from 'next/server'
import { requirePerm } from '@/lib/auth/access'

const TEXT: Record<string, number> = {
  name: 120, email: 160, phone: 40, address: 300, website: 200, abn_nzbn: 40, gst_number: 40,
  country: 60, timezone: 60, date_format: 20, logo_url: 1000, base_currency: 3,
}

export async function PATCH(req: Request) {
  const g = await requirePerm('manage_company')
  if ('res' in g) return g.res
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const b = body as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, max] of Object.entries(TEXT)) {
    if (!(key in b) || b[key] === undefined) continue
    if (typeof b[key] !== 'string') return NextResponse.json({ error: `Invalid ${key.replace(/_/g, ' ')}` }, { status: 400 })
    updates[key] = key === 'base_currency' ? (b[key] as string).trim().toUpperCase().slice(0, max) : (b[key] as string).trim().slice(0, max)
  }
  if ('name' in updates && !updates.name) return NextResponse.json({ error: 'Business name is required.' }, { status: 400 })
  if ('base_currency' in updates && !/^[A-Z]{3}$/.test(updates.base_currency as string)) return NextResponse.json({ error: 'Choose a valid base currency.' }, { status: 400 })
  if ('decimal_places' in b && b.decimal_places !== undefined) {
    const n = Number(b.decimal_places)
    if (!Number.isInteger(n) || n < 0 || n > 4) return NextResponse.json({ error: 'Decimal places must be between 0 and 4.' }, { status: 400 })
    updates.decimal_places = n
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

  const { error } = await g.access.db.from('organisations').update(updates).eq('id', g.access.orgId)
  if (error) { console.error('company update failed', error.message); return NextResponse.json({ error: 'We couldn’t save your business details. Please try again.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
