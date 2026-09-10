import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
    .single()

  const m = membership as { role: string; first_name: string | null; last_name: string | null; email: string | null } | null

  if (!m || m.role !== 'admin') redirect('/')

  const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || user.email || 'Admin'

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F0F2F5', fontFamily: 'var(--font-ui)' }}>
      <HubSidebar userName={name} userEmail={user.email ?? ''} />
      <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        {children}
      </main>
    </div>
  )
}
