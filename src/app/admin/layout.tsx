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
    <div style={{
      display: 'flex', height: '100vh', background: '#070B14', fontFamily: 'var(--font-ui)',
      ['--slate' as string]: '#E8EEF9', ['--gray-900' as string]: '#E8EEF9', ['--gray-400' as string]: '#8EA0BC',
      ['--gray-200' as string]: 'rgba(255,255,255,0.14)', ['--gray-100' as string]: 'rgba(255,255,255,0.08)',
      ['--gray-50' as string]: 'rgba(255,255,255,0.04)', ['--teal' as string]: '#8B5CF6',
      ['--shadow-sm' as string]: 'none', ['--hub-card' as string]: '#0F1A2E', colorScheme: 'dark',
    }}>
      <HubSidebar userName={name} userEmail={user.email ?? ''} />
      <main style={{ flex: 1, overflow: 'auto', padding: '40px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6' }}/>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#8EA0BC', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              inventaHQ Hub — Internal Admin
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#64748B' }}>
            hub.inventahq.com
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}
