// src/app/(app)/sales/returns/page.tsx — the Returns list: every credit note, newest first.
import { redirect } from 'next/navigation'
import { getAccess, can } from '@/lib/auth/access'
import ReturnsTable from '@/components/app/returns-table'
import { allRows } from '@/lib/all-rows'
import { loadSettings } from '@/lib/credit-notes/server'

export const dynamic = 'force-dynamic'

export default async function ReturnsPage() {
  const a = await getAccess()
  if (!a) redirect('/login')
  if (!can(a, 'view_sales')) redirect('/no-access')
  const settings = await loadSettings(a.db, a.orgId)
  const [{ data }, { data: locations }] = await Promise.all([
    allRows((x, y) => a.db.from('credit_notes')
      .select('id, cn_number, so_id, so_number, customer_name, return_date, reason, status, total_amount, currency, location_id, location_name, created_at')
      .eq('org_id', a.orgId).order('created_at', { ascending: false }).order('id').range(x, y)),
    a.db.from('locations').select('id, name').eq('org_id', a.orgId).eq('active', true).order('name'),
  ])
  return <ReturnsTable rows={data} enabled={settings.enabled} locations={(locations ?? []) as { id: string; name: string }[]} canProcess={can(a, 'process_returns')} />
}
