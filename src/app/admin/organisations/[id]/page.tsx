import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import OrgStatusForm from './org-status-form'

export const dynamic = 'force-dynamic'

type Org = {
  id: string
  org_number: string | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  base_currency: string
  timezone: string
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
}

type Member = {
  id: string
  user_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  role: string
  invite_status: string
  invited_at: string | null
}

const statusStyle: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#D1FAE5', color: '#065F46' },
  inactive:  { bg: '#F3F4F6', color: '#6B7280' },
  suspended: { bg: '#FEF3C7', color: '#92400E' },
  pending:   { bg: '#EFF6FF', color: '#1E40AF' },
  accepted:  { bg: '#D1FAE5', color: '#065F46' },
}

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: org, error: orgErr } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', id)
    .single()

  if (orgErr || !org) redirect('/admin/organisations')

  const o = org as Org

  const { data: members } = await supabase
    .from('org_members')
    .select('id, user_id, first_name, last_name, email, role, invite_status, invited_at')
    .eq('org_id', id)
    .order('invited_at', { ascending: false })

  const memberList = (members ?? []) as Member[]

  return (
    <div style={{ maxWidth: '800px' }}>
      <Link href="/admin/organisations" style={{ fontSize: '13px', color: 'var(--gray-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '16px' }}>
        ← Back to Organisations
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--teal)', marginBottom: '4px' }}>
            {o.org_number ?? '—'}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>
            {o.name}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '2px' }}>
            Created {new Date(o.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <span style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
          background: statusStyle[o.status]?.bg, color: statusStyle[o.status]?.color,
        }}>
          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
        </span>
      </div>

      <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', padding: '24px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: '18px' }}>
          Organisation Details
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
          {[
            { label: 'Email',         value: o.email },
            { label: 'Phone',         value: o.phone },
            { label: 'Address',       value: o.address },
            { label: 'Base Currency', value: o.base_currency },
            { label: 'Timezone',      value: o.timezone },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '14px', color: value ? 'var(--slate)' : 'var(--gray-400)', fontWeight: value ? 500 : 400 }}>{value ?? '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <OrgStatusForm orgId={o.id} currentStatus={o.status} />

      <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--slate)' }}>Users</div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>{memberList.length} member{memberList.length !== 1 ? 's' : ''}</div>
          </div>
          <Link href={`/admin/organisations/${o.id}/users/invite`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'var(--teal)', color: 'white', textDecoration: 'none',
            padding: '0 14px', height: '36px', borderRadius: '9px',
            fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-display)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Invite User
          </Link>
        </div>

        {memberList.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
            No users yet. Invite the first user to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                {['Name', 'Email', 'Role', 'Status', 'Invited'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberList.map((m, i) => {
                const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ') || '—'
                return (
                  <tr key={m.id} style={{ borderBottom: i < memberList.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <td style={{ padding: '13px 16px', fontWeight: 600, color: 'var(--slate)', fontSize: '13.5px' }}>{fullName}</td>
                    <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>{m.email ?? '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate)', background: 'var(--gray-100)', padding: '3px 8px', borderRadius: '6px' }}>
                        {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px',
                        background: statusStyle[m.invite_status]?.bg ?? '#F3F4F6',
                        color: statusStyle[m.invite_status]?.color ?? '#6B7280',
                      }}>
                        {m.invite_status.charAt(0).toUpperCase() + m.invite_status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>
                      {m.invited_at ? new Date(m.invited_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
