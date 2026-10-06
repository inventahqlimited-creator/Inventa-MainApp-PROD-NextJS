import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { getAccessUnchecked } from '@/lib/auth/access'
import { loadSecurity, isIpAllowed } from '@/lib/auth/security-settings'
import { clientIp } from '@/lib/rate-limit'
import IdleGuard from '@/components/app/idle-guard'
import { PermissionsProvider } from '@/components/app/permissions-provider'
import AppSidebar from '@/components/app/app-sidebar'
import AppTopbar from '@/components/app/app-topbar'
import { normalizePolicy, isPasswordExpired } from '@/lib/auth/password-policy'
import ToastProvider from '@/components/app/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccessUnchecked()
  if (!access) redirect('/login')

  const adminClient = createAdminClient()

  // Organisation security settings: IP allow-list, session timeout, audit log
  const security = await loadSecurity(adminClient, access.orgId)
  const ip = clientIp(await headers())
  if (!isIpAllowed(security, ip)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--slate)', padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: 'center', color: '#fff' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>Access restricted</h1>
          <p style={{ marginTop: 10, fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
            Your organisation only allows access from approved networks, and this one ({ip}) isn&apos;t on the list.
            Ask an administrator to add it, or connect from an approved network.
          </p>
          <a href="/auth/timeout?reason=signout" style={{ display: 'inline-block', marginTop: 18, color: '#5EEAD4', fontSize: 14 }}>Sign out</a>
        </div>
      </div>
    )
  }
  // Session timeout: a person who hasn't opened a page for longer than the limit is signed out
  const lastSeen = Number((await cookies()).get('inv_la')?.value)
  if (lastSeen && Date.now() - lastSeen > security.session_timeout_minutes * 60_000) redirect('/auth/timeout')

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

  // Password rotation: if the organisation requires a periodic change and it is due, send them to set a new one.
  // Both lookups tolerate the columns not existing yet (before the SQL is run) — then nothing is enforced.
  const [{ data: pwOrg }, { data: pwMember }] = await Promise.all([
    adminClient.from('organisations').select('password_policy').eq('id', m.org_id).single(),
    adminClient.from('org_members').select('password_changed_at').eq('user_id', access.userId).eq('org_id', m.org_id).single(),
  ])
  const policy = normalizePolicy((pwOrg as { password_policy?: unknown } | null)?.password_policy)
  if (isPasswordExpired(policy, (pwMember as { password_changed_at?: string | null } | null)?.password_changed_at)) {
    redirect('/auth/update-password?expired=1')
  }

  const displayName = [m.first_name, m.last_name].filter(Boolean).join(' ') || user.email || 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const orgName = (org as { name: string } | null)?.name ?? 'inventaHQ'
  const xeroEnabled = Boolean((org as { xero_enabled?: boolean | null } | null)?.xero_enabled)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#ECEEED' }}>
      <AppSidebar xeroEnabled={xeroEnabled} perms={access.perms} auditEnabled={security.audit_log_enabled} />
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
      <IdleGuard minutes={security.session_timeout_minutes} />
      <ToastProvider />
    </div>
  )
}
