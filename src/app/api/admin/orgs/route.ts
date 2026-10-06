import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { logHub } from '@/lib/hub/activity'

const STATUSES = ['active', 'inactive', 'suspended']
const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function POST(request: Request) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const name = s(b.name, 120)
  if (!name) return NextResponse.json({ error: 'Organisation name is required.' }, { status: 400 })
  const status = STATUSES.includes(String(b.status)) ? String(b.status) : 'active'

  const { data, error } = await g.db.from('organisations').insert({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    email: s(b.email, 200), phone: s(b.phone, 40), address: s(b.address, 300),
    country: s(b.country, 80),
    base_currency: s(b.base_currency, 3) ?? 'NZD', timezone: s(b.timezone, 60) ?? 'Pacific/Auckland',
    status,
  }).select('id, org_number').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create the organisation' }, { status: 500 })

  await logHub(g.db, { orgId: data.id, actorId: g.user.id, actorEmail: g.user.email, action: 'org.created', summary: `Created organisation “${name}”` })
  return NextResponse.json({ success: true, id: data.id })
}
