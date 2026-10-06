// src/app/api/org/reports/[id]/route.ts
// POST { filters } → the report's columns, rows and summary tiles.
import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { REPORT_MAP, type Filters } from '@/lib/reports/registry'
import { runReport } from '@/lib/reports/run'
import { getAccess, can, denyResponse } from '@/lib/auth/access'
import { REPORT_SECTION_PERM, FINANCIAL_REPORT_IDS } from '@/lib/permissions'

export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!REPORT_MAP.has(id)) return NextResponse.json({ error: 'Unknown report' }, { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  const section = REPORT_MAP.get(id)!.section
  if (!can(access, REPORT_SECTION_PERM[section])) return denyResponse('You don’t have permission to view these reports.')
  if ((FINANCIAL_REPORT_IDS as readonly string[]).includes(id) && !can(access, 'view_financial_reports')) return denyResponse('You don’t have permission to view financial reports.')

  const admin = createAdminClient()
  const { data: m } = await admin.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').maybeSingle()
  if (!m) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  let filters: Filters = {}
  try { const body = await req.json(); if (body && typeof body.filters === 'object' && body.filters) filters = body.filters } catch { /* no body = no filters */ }

  try {
    const result = await runReport(id, admin, (m as { org_id: string }).org_id, filters)
    return NextResponse.json(result)
  } catch (e) {
    console.error('report failed', id, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not run the report' }, { status: 500 })
  }
}
