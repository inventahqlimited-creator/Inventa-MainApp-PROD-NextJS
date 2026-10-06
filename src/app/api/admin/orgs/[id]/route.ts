import { NextResponse } from 'next/server'
import { requireHub } from '@/lib/hub/guard'
import { logHub } from '@/lib/hub/activity'
import { isUuid } from '@/lib/auth/platform-admin'
import { isPlan, planLabel } from '@/lib/hub/constants'

const STATUSES = ['active', 'inactive', 'suspended']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const text = (max: number, required = false) => (v: unknown) => {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, max)
  if (!t && required) return undefined
  return t || null
}

type Field = { label: string; parse: (v: unknown) => unknown; fmt?: (v: unknown) => string }
const FIELDS: Record<string, Field> = {
  name:                { label: 'Name', parse: text(120, true) },
  email:               { label: 'Email', parse: text(200) },
  phone:               { label: 'Phone', parse: text(40) },
  address:             { label: 'Address', parse: text(300) },
  country:             { label: 'Country', parse: text(80) },
  base_currency:       { label: 'Base currency', parse: text(3, true) },
  timezone:            { label: 'Timezone', parse: text(60, true) },
  status:              { label: 'Status', parse: v => (STATUSES.includes(String(v)) ? String(v) : undefined) },
  xero_enabled:        { label: 'Xero', parse: v => (typeof v === 'boolean' ? v : undefined), fmt: v => (v ? 'enabled' : 'disabled') },
  subscription_plan:   { label: 'Subscription', parse: v => (isPlan(v) ? v : undefined), fmt: v => planLabel(String(v)) },
  user_limit:          { label: 'User limit', parse: v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : undefined } },
  subscription_amount: { label: 'Amount (AUD)', parse: v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined } },
  subscription_start:  { label: 'Start date', parse: v => (v === null || v === '' ? null : typeof v === 'string' && DATE_RE.test(v) ? v : undefined) },
  subscription_end:    { label: 'End date', parse: v => (v === null || v === '' ? null : typeof v === 'string' && DATE_RE.test(v) ? v : undefined) },
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireHub()
  if ('res' in g) return g.res
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const [k, f] of Object.entries(FIELDS)) {
    if (!(k in b)) continue
    const v = f.parse(b[k])
    if (v === undefined) return NextResponse.json({ error: `Invalid value for ${f.label}` }, { status: 400 })
    update[k] = v
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ success: true })

  const { data: before } = await g.db.from('organisations').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  const o = before as Record<string, unknown>

  // a lower user limit than the people already on the team would be confusing — block it
  if (typeof update.user_limit === 'number') {
    const { count } = await g.db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', id).in('invite_status', ['accepted', 'pending'])
    if ((count ?? 0) > update.user_limit) return NextResponse.json({ error: `This organisation already has ${count} users (including pending invites). Remove some first or set the limit to ${count} or more.` }, { status: 400 })
  }
  const start = (update.subscription_start ?? o.subscription_start) as string | null
  const end = (update.subscription_end ?? o.subscription_end) as string | null
  if (start && end && end < start) return NextResponse.json({ error: 'End date can’t be before the start date.' }, { status: 400 })

  const changes = Object.entries(update).filter(([k, v]) => (o[k] ?? null) !== v)
  if (changes.length === 0) return NextResponse.json({ success: true })

  const { error } = await g.db.from('organisations').update(Object.fromEntries(changes)).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const show = (k: string, v: unknown) => (FIELDS[k].fmt ? FIELDS[k].fmt!(v) : v === null || v === '' ? 'blank' : String(v))
  for (const [k, v] of changes) {
    const isToggle = k === 'xero_enabled'
    await logHub(g.db, {
      orgId: id, actorId: g.user.id, actorEmail: g.user.email,
      action: isToggle ? (v ? 'xero.enabled' : 'xero.disabled') : `org.${k}`,
      summary: isToggle ? `Xero ${show(k, v)}` : `${FIELDS[k].label}: ${show(k, o[k])} → ${show(k, v)}`,
      details: { field: k, from: o[k] ?? null, to: v },
    })
  }
  return NextResponse.json({ success: true })
}
