// src/app/(app)/reports/[id]/page.tsx
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { REPORT_MAP } from '@/lib/reports/registry'
import { loadLookups } from '@/lib/reports/run'
import ReportViewer from '@/components/app/report-viewer'

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const def = REPORT_MAP.get(id)
  if (!def) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: m } = await admin.from('org_members').select('org_id').eq('user_id', user.id).eq('invite_status', 'accepted').maybeSingle()
  if (!m) redirect('/login')
  const orgId = (m as { org_id: string }).org_id

  const [lookups, { data: org }] = await Promise.all([
    loadLookups(admin, orgId),
    admin.from('organisations').select('name, trading_name').eq('id', orgId).single(),
  ])
  const o = (org ?? {}) as { name?: string | null; trading_name?: string | null }

  return <ReportViewer def={def} lookups={lookups} orgName={o.trading_name || o.name || ''} />
}
