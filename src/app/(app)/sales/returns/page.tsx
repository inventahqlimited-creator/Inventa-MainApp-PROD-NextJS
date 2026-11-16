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
  const { data } = await allRows((x, y) => a.db.from('credit_notes')
    .select('id, cn_number, so_id, so_number, customer_name, return_date, reason, status, total_amount, currency, location_name, created_at')
    .eq('org_id', a.orgId).order('created_at', { ascending: false }).order('id').range(x, y))
  return <ReturnsTable rows={data} enabled={settings.enabled} />
}
