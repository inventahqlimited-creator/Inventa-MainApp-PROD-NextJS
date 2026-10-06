import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PLATFORM_ORG_ID, isPlatformAdmin } from '@/lib/auth/platform-admin'
import HubSidebar from '@/components/hub/hub-sidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('role, first_name, last_name, email')
    .eq('user_id', user.id)
    .eq('org_id', PLATFORM_ORG_ID)
    .eq('role', 'admin')
    .eq('invite_status', 'accepted')
    .limit(1)
    .maybeSingle()

  const m = membership as { role: string; first_name: string | null; last_name: string | null; email: string | null } | null

  if (!m || !(await isPlatformAdmin(createAdminClient(), user.id))) redirect('/')

  const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || user.email || 'Admin'

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#E8EAED', fontFamily: 'var(--font-ui)' }}>
      <HubSidebar userName={name} userEmail={user.email ?? ''} />
      <main style={{ flex: 1, overflow: 'auto', padding: '40px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid #D1D5DB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0D9488' }}/>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              inventaHQ Hub — Internal Admin
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
            hub.inventahq.com
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}
