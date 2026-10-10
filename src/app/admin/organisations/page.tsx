import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { isSupportEmail } from '@/lib/hub/support'
import { fmtAud, fmtDate, planLabel } from '@/lib/hub/constants'

export const metadata = { title: 'Organisations — inventaHQ Hub' }
export const dynamic = 'force-dynamic'

type Org = {
  id: string; org_number: string | null; name: string; email: string | null; phone: string | null
  country: string | null; status: 'active' | 'inactive' | 'suspended'; created_at: string
  subscription_plan: string | null; user_limit: number | null; subscription_amount: number | null
}

const statusStyle: Record<string, { bg: string; color: string }> = {
  active:    { bg: 'rgba(16,185,129,0.15)', color: '#6EE7B7' },
  inactive:  { bg: 'rgba(148,163,184,0.15)', color: '#CBD5E1' },
  suspended: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
}

const ctl: React.CSSProperties = {
  height: '40px', padding: '0 12px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', background: 'var(--hub-card)',
  color: 'var(--gray-900)', fontFamily: 'var(--font-ui)', fontSize: '13.5px', outline: 'none',
}

export default async function OrganisationsPage({ searchParams }: { searchParams: Promise<{ q?: string; country?: string; status?: string }> }) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim().toLowerCase()
  const countryF = sp.country ?? ''
  const statusF = sp.status ?? ''

  // Layout has already verified platform admin; admin client bypasses RLS to span all orgs.
  const supabase = createAdminClient()
  const { data: orgs, error } = await supabase.from('organisations').select('*').order('created_at', { ascending: false })
  const all = (orgs ?? []) as Org[]

  const { data: mem } = await supabase.from('org_members').select('org_id, invite_status, email')
  const counts: Record<string, { active: number; pending: number }> = {}
  for (const m of ((mem ?? []) as { org_id: string; invite_status: string; email: string | null }[]).filter(x => !isSupportEmail(x.email))) {
    const c = (counts[m.org_id] ??= { active: 0, pending: 0 })
    if (m.invite_status === 'accepted') c.active++
    else if (m.invite_status === 'pending') c.pending++
  }

  const countries = [...new Set(all.map(o => o.country).filter((c): c is string => !!c))].sort()
  const orgList = all.filter(o =>
    (!countryF || o.country === countryF) &&
    (!statusF || o.status === statusF) &&
    (!q || [o.org_number, o.name, o.email, o.phone, o.country].some(v => (v ?? '').toLowerCase().includes(q))))
  const filtered = Boolean(q || countryF || statusF)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>Organisations</h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {filtered ? `${orgList.length} of ${all.length}` : all.length} organisation{all.length !== 1 ? 's' : ''}{filtered ? ' match' : ' total'}
          </p>
        </div>
        <Link href="/admin/organisations/new" style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'var(--teal)', color: 'white', textDecoration: 'none',
          padding: '0 18px', height: '40px', borderRadius: '10px', fontFamily: 'var(--font-display)', fontSize: '13.5px', fontWeight: 700,
          boxShadow: '0 4px 14px rgba(139,92,246,0.25)',
        }}>+ New Organisation</Link>
      </div>

      <form method="get" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Search by org number, name, email, phone…" style={{ ...ctl, flex: '1 1 280px', minWidth: 0 }} />
        <select name="country" defaultValue={countryF} style={ctl}>
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="status" defaultValue={statusF} style={ctl}>
          <option value="">All statuses</option>
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
        </select>
        <button type="submit" style={{ ...ctl, background: 'var(--teal)', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer', padding: '0 18px' }}>Search</button>
        {filtered && <Link href="/admin/organisations" style={{ ...ctl, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: 'var(--gray-400)' }}>Clear</Link>}
      </form>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.35)', borderRadius: '10px', padding: '14px 16px', color: '#FCA5A5', fontSize: '13px', marginBottom: '20px' }}>
          Error loading organisations.
        </div>
      )}

      <div style={{ background: 'var(--hub-card)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {orgList.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px' }}>
              {filtered ? 'No organisations match' : 'No organisations yet'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>{filtered ? 'Try a different search or clear the filters.' : 'Create your first organisation to get started.'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                  {['Org #', 'Name', 'Email', 'Country', 'Plan', 'Users', 'Amount (AUD)', 'Status', 'Created', ''].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: h === 'Amount (AUD)' ? 'right' : 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgList.map((org, i) => {
                  const c = counts[org.id]
                  const used = (c?.active ?? 0) + (c?.pending ?? 0)
                  const td: React.CSSProperties = { padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px', whiteSpace: 'nowrap' }
                  return (
                    <tr key={org.id} style={{ borderBottom: i < orgList.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '12.5px', fontWeight: 700, color: 'var(--teal)' }}>{org.org_number ?? '—'}</td>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--slate)', fontSize: '13.5px' }}>{org.name}</td>
                      <td style={td}>{org.email ?? '—'}</td>
                      <td style={td}>{org.country ?? '—'}</td>
                      <td style={td}>{planLabel(org.subscription_plan)}</td>
                      <td style={{ ...td, color: 'var(--slate)' }}>
                        {used}{org.user_limit ? ` / ${org.user_limit}` : ''}
                        {(c?.pending ?? 0) > 0 && <span style={{ color: 'var(--gray-400)' }}> · {c.pending} pending</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{fmtAud(org.subscription_amount)}</td>
                      <td style={td}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: statusStyle[org.status]?.bg, color: statusStyle[org.status]?.color }}>
                          {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                        </span>
                      </td>
                      <td style={td}>{fmtDate(org.created_at)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Link href={`/admin/organisations/${org.id}`} style={{ color: 'var(--teal)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>View →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
