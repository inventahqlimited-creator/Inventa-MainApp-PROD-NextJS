import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppSidebar from '@/components/app/app-sidebar'
import AppTopbar from '@/components/app/app-topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  const { data: membership } = await adminClient
    .from('org_members')
    .select('role, org_id, first_name, last_name')
    .eq('user_id', user.id)
    .eq('invite_status', 'accepted')
    .single()

  if (!membership) redirect('/login')

  const m = membership as { role: string; org_id: string; first_name: string | null; last_name: string | null }

  const { data: org } = await adminClient
    .from('organisations')
    .select('name')
    .eq('id', m.org_id)
    .single()

  const displayName = [m.first_name, m.last_name].filter(Boolean).join(' ') || user.email || 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const orgName = (org as { name: string } | null)?.name ?? 'inventaHQ'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#ECEEED' }}>
      <AppSidebar />
      <div className="main">
        <AppTopbar
          displayName={displayName}
          initials={initials}
          role={m.role}
          orgName={orgName}
          email={user.email ?? ''}
        />
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}
