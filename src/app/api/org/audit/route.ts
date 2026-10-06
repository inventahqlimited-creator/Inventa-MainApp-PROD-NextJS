// src/app/api/org/audit/route.ts
// Audit log feed — filters: q, category, user, from, to (ISO). `format=csv` returns every matching row as a CSV file.
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAccess, can, denyResponse } from '@/lib/auth/access'

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: m } = await db.from('org_members').select('org_id, role').eq('user_id', user.id).eq('invite_status', 'accepted').limit(1).maybeSingle()
  if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { org_id: orgId, role } = m as { org_id: string; role: string }
  void role
  const access = await getAccess()
  if (!access || !can(access, 'view_audit_log')) return denyResponse('You don’t have permission to view the audit log.')
  if (new URL(req.url).searchParams.get('format') === 'csv' && !can(access, 'export_audit_log')) return denyResponse('You don’t have permission to export the audit log.')

  const sp = new URL(req.url).searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const size = Math.min(100, Math.max(1, Number(sp.get('size')) || 15))
  const csv = sp.get('format') === 'csv'
  const q = (sp.get('q') ?? '').replace(/[,()%*\\]/g, ' ').trim()
  const category = sp.get('category') ?? ''
  const who = sp.get('user') ?? ''
  const from = sp.get('from')
  const to = sp.get('to')

  let query = db
    .from('audit_log')
    .select('id, created_at, category, action, ref, detail, user_name, entity_type, entity_id', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (category) query = query.eq('category', category)
  if (who) query = who === '__none__' ? query.is('user_name', null) : query.eq('user_name', who)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)
  if (q) query = query.or(`action.ilike.%${q}%,ref.ilike.%${q}%,detail.ilike.%${q}%,user_name.ilike.%${q}%`)

  if (csv) {
    const { data, error } = await query.range(0, 4999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as { created_at: string; category: string; action: string; ref: string | null; detail: string | null; user_name: string | null }[]
    const body = ['Timestamp,Category,Action,Reference,Detail,User',
      ...rows.map(r => [r.created_at, r.category, r.action, r.ref, r.detail, r.user_name ?? ''].map(csvCell).join(','))].join('\n')
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` } })
  }

  const { data, count, error } = await query.range((page - 1) * size, page * size - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // distinct users for the filter (first load only needs this)
  const { data: us } = await db.from('audit_log').select('user_name').eq('org_id', orgId).not('user_name', 'is', null).limit(2000)
  const users = [...new Set(((us ?? []) as { user_name: string }[]).map(r => r.user_name))].sort()

  return NextResponse.json({ events: data ?? [], total: count ?? 0, users })
}
