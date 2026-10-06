import { createAdminClient } from '@/lib/supabase/server'
import { PLATFORM_ORG_ID } from '@/lib/auth/platform-admin'
import { fmtDate, fmtDateTime } from '@/lib/hub/constants'
import AddHubUser from './add-hub-user'

export const metadata = { title: 'Hub users — inventaHQ Hub' }
export const dynamic = 'force-dynamic'

type Row = { id: string; user_id: string | null; first_name: string | null; last_name: string | null; email: string | null; invited_at: string | null }

export default async function HubUsersPage() {
  const db = createAdminClient() // layout has verified a platform admin
  const { data } = await db.from('org_members').select('id, user_id, first_name, last_name, email, invited_at')
    .eq('org_id', PLATFORM_ORG_ID).eq('role', 'admin').eq('invite_status', 'accepted').order('invited_at', { ascending: true })
  const rows = await Promise.all(((data ?? []) as Row[]).map(async r => {
    const last = r.user_id ? (await db.auth.admin.getUserById(r.user_id)).data?.user?.last_sign_in_at ?? null : null
    return { ...r, last }
  }))
  const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase' }
  const td: React.CSSProperties = { padding: '13px 16px', fontSize: '13px', color: 'var(--gray-400)', whiteSpace: 'nowrap' }

  return (
    <div style={{ maxWidth: '900px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>Hub users</h1>
      <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '2px 0 24px' }}>People who can sign in to this Hub and manage every organisation.</p>
      <AddHubUser />
      <div style={{ background: 'var(--hub-card)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
              {['Name', 'Email', 'Last login', 'Added'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <td style={{ ...td, color: 'var(--slate)', fontWeight: 600 }}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td style={td}>{r.email ?? '—'}</td>
                  <td style={td}>{r.last ? fmtDateTime(r.last) : 'Never'}</td>
                  <td style={td}>{fmtDate(r.invited_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
