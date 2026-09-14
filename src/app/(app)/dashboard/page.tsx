import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawMembership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single()
  const membership = rawMembership as { org_id: string; role: string } | null

  return (
    <div style={{ padding: '48px', fontFamily: 'var(--font-display)' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--slate)', marginBottom: '8px' }}>
        inventaHQ
      </h1>
      <p style={{ color: 'var(--gray-400)', marginBottom: '32px' }}>
        Phase 1 — Foundation complete ✓
      </p>
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', maxWidth: '480px', boxShadow: 'var(--shadow-sm)' }}>
        <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '4px' }}>Signed in as</p>
        <p style={{ fontWeight: 600, color: 'var(--slate)' }}>{user.email}</p>
        {membership && (
          <>
            <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '16px', marginBottom: '4px' }}>Organisation</p>
            <p style={{ fontWeight: 600, color: 'var(--slate)' }}>{membership.org_id}</p>
            <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '4px' }}>Role: {membership.role}</p>
          </>
        )}
      </div>
    </div>
  )
}
