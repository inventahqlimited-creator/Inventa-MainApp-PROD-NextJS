import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DetailsCard, SubscriptionCard, type OrgData } from './org-panels'
import UsersTable, { type MemberRow } from './users-table'
import { fmtDate, fmtDateTime } from '@/lib/hub/constants'

export const dynamic = 'force-dynamic'

const statusStyle: Record<string, { bg: string; color: string }> = {
  active:    { bg: 'rgba(16,185,129,0.15)', color: '#6EE7B7' },
  inactive:  { bg: 'rgba(148,163,184,0.15)', color: '#CBD5E1' },
  suspended: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
}

type LogRow = { id: string; actor_email: string | null; summary: string; action: string; created_at: string }

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient() // the Hub layout has already verified a platform admin

  const { data: org, error: orgErr } = await supabase.from('organisations').select('*').eq('id', id).single()
  if (orgErr || !org) redirect('/admin/organisations')
  const raw = org as Record<string, unknown>
  const o: OrgData & { org_number: string | null; created_at: string } = {
    id, org_number: (raw.org_number as string) ?? null, created_at: raw.created_at as string,
    name: raw.name as string, email: (raw.email as string) ?? null, phone: (raw.phone as string) ?? null, address: (raw.address as string) ?? null,
    country: (raw.country as string) ?? null, base_currency: raw.base_currency as string, timezone: raw.timezone as string, status: raw.status as string,
    xero_enabled: Boolean(raw.xero_enabled), subscription_plan: (raw.subscription_plan as string) ?? 'monthly',
    user_limit: Number(raw.user_limit ?? 3), subscription_amount: Number(raw.subscription_amount ?? 0),
    subscription_start: (raw.subscription_start as string) ?? null, subscription_end: (raw.subscription_end as string) ?? null,
  }

  const { data: members } = await supabase
    .from('org_members')
    .select('id, user_id, first_name, last_name, email, role, invite_status, invited_at')
    .eq('org_id', id)
    .order('invited_at', { ascending: false })
  const base = (members ?? []) as (Omit<MemberRow, 'last_login'> & { user_id: string | null })[]

  // last sign-in lives on the login account, not the membership row
  const memberList: MemberRow[] = await Promise.all(base.map(async ({ user_id, ...m }) => {
    let last_login: string | null = null
    if (user_id && m.invite_status === 'accepted') {
      const { data } = await supabase.auth.admin.getUserById(user_id)
      last_login = data?.user?.last_sign_in_at ?? null
    }
    return { ...m, last_login }
  }))
  const used = memberList.filter(m => m.invite_status === 'accepted' || m.invite_status === 'pending').length

  const { data: logs } = await supabase
    .from('hub_activity_log').select('id, actor_email, summary, action, created_at')
    .eq('org_id', id).order('created_at', { ascending: false }).limit(100)
  const logList = (logs ?? []) as LogRow[]

  return (
    <div style={{ maxWidth: '1000px' }}>
      <Link href="/admin/organisations" style={{ fontSize: '13px', color: 'var(--gray-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '16px' }}>
        ← Back to Organisations
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--teal)', marginBottom: '4px' }}>{o.org_number ?? '—'}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{o.name}</h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '2px' }}>Created {fmtDate(o.created_at)}</p>
        </div>
        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: statusStyle[o.status]?.bg, color: statusStyle[o.status]?.color }}>
          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
        </span>
      </div>

      <DetailsCard org={o} />
      <SubscriptionCard org={o} used={used} />
      <UsersTable members={memberList} orgId={o.id} limit={o.user_limit} />

      <div style={{ background: 'var(--hub-card)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--gray-100)', fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--slate)' }}>
          Activity log
        </div>
        {logList.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>No activity recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                  {['When', 'By', 'What happened'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logList.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: i < logList.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <td style={{ padding: '11px 16px', fontSize: '13px', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{l.actor_email ?? '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', color: 'var(--slate)' }}>{l.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
