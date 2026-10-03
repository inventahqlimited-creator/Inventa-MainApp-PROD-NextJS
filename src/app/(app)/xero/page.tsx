// src/app/(app)/xero/page.tsx
import { redirect } from 'next/navigation'
import { xeroAuth } from '@/lib/xero/auth'
import XeroHome from '@/components/app/xero-home'

export default async function XeroPage() {
  const auth = await xeroAuth()
  if (!auth) redirect('/login')
  if (!auth.enabled) redirect('/dashboard') // the menu entry only exists once Xero is switched on

  const { data } = await auth.db.from('xero_connections').select('status, tenant_name').eq('org_id', auth.orgId).maybeSingle()
  const c = data as { status: 'pending' | 'connected' | 'needs_reconnect'; tenant_name: string | null } | null

  return <XeroHome status={c?.status ?? null} tenantName={c?.tenant_name ?? null} isAdmin={auth.isAdmin} />
}
