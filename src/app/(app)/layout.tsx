import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { PermissionsProvider } from '@/components/app/permissions-provider'
import AppSidebar from '@/components/app/app-sidebar'
import AppTopbar from '@/components/app/app-topbar'
import ToastProvider from '@/components/app/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess()
  if (!access) redirect('/login')

  const adminClient = createAdminClient()

  const { data: membership } = await adminClient
    .from('org_members')
    .select('first_name, last_name, avatar_url')
    .eq('user_id', access.userId)
    .eq('invite_status', 'accepted')
    .single()

  const m = {
    role: access.role,
    org_id: access.orgId,
    ...((membership ?? {}) as { first_name?: string | null; last_name?: string | null; avatar_url?: string | null }),
  } as { role: string; org_id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }
  const user = { email: access.email }

  const { data: org } = await adminClient
    .from('organisations')
    .select('name, xero_enabled')
    .eq('id', m.org_id)
    .single()

  const displayName = [m.first_name, m.last_name].filter(Boolean).join(' ') || user.email || 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const orgName = (org as { name: string } | null)?.name ?? 'inventaHQ'
  const xeroEnabled = Boolean((org as { xero_enabled?: boolean | null } | null)?.xero_enabled)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#ECEEED' }}>
      <AppSidebar xeroEnabled={xeroEnabled} perms={access.perms} />
      <div className="main">
        <AppTopbar
          displayName={displayName}
          initials={initials}
          role={m.role}
          orgName={orgName}
          email={user.email ?? ''}
          avatarUrl={m.avatar_url ?? ''}
        />
        <div className="content">
          <PermissionsProvider perms={access.perms} isAdmin={access.isAdmin}>
            {children}
          </PermissionsProvider>
        </div>
      </div>
      <ToastProvider />
    </div>
  )
}
