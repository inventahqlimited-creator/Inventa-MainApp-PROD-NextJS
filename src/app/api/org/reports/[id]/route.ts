// src/app/api/org/reports/[id]/route.ts
// POST { filters } → the report's columns, rows and summary tiles.
import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { REPORT_MAP, type Filters } from '@/lib/reports/registry'
import { runReport } from '@/lib/reports/run'

export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!REPORT_MAP.has(id)) return NextResponse.json({ error: 'Unknown report' }, { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createAdminClient()
  const { data: m } = await admin.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').maybeSingle()
  if (!m) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  let filters: Filters = {}
  try { const body = await req.json(); if (body && typeof body.filters === 'object' && body.filters) filters = body.filters } catch { /* no body = no filters */ }

  try {
    const result = await runReport(id, admin, (m as { org_id: string }).org_id, filters)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not run the report' }, { status: 500 })
  }
}
