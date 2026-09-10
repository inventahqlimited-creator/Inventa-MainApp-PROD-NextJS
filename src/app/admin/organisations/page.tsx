import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const metadata = { title: 'Organisations — inventaHQ Hub' }
export const dynamic = 'force-dynamic'

type Org = {
  id: string
  org_number: string
  name: string
  email: string | null
  phone: string | null
  base_currency: string
  timezone: string
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
}

const statusStyle: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#D1FAE5', color: '#065F46' },
  inactive:  { bg: '#F3F4F6', color: '#6B7280' },
  suspended: { bg: '#FEF3C7', color: '#92400E' },
}

export default async function OrganisationsPage() {
  const supabase = await createClient()

  const { data: orgs, error } = await supabase
    .from('organisations')
    .select('id, org_number, name, email, phone, base_currency, timezone, status, created_at')
    .order('created_at', { ascending: false })

  const orgList = (orgs ?? []) as Org[]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>
            Organisations
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {orgList.length} organisation{orgList.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/admin/organisations/new" style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: 'var(--teal)', color: 'white', textDecoration: 'none',
          padding: '0 18px', height: '40px', borderRadius: '10px',
          fontFamily: 'var(--font-display)', fontSize: '13.5px', fontWeight: 700,
          boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Organisation
        </Link>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '14px 16px', color: '#B91C1C', fontSize: '13px', marginBottom: '20px' }}>
          Error loading organisations. Run the database migration first.
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {orgList.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--gray-400)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px' }}>No organisations yet</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>Create your first organisation to get started.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                {['Org #', 'Name', 'Email', 'Currency', 'Status', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgList.map((org, i) => (
                <tr key={org.id} style={{ borderBottom: i < orgList.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: '12.5px', fontWeight: 700, color: 'var(--teal)' }}>{org.org_number ?? '—'}</td>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: 'var(--slate)', fontSize: '13.5px' }}>{org.name}</td>
                  <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>{org.email ?? '—'}</td>
                  <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>{org.base_currency}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                      background: statusStyle[org.status]?.bg ?? '#F3F4F6',
                      color: statusStyle[org.status]?.color ?? '#6B7280',
                    }}>
                      {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>
                    {new Date(org.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                    <Link href={`/admin/organisations/${org.id}`} style={{ color: 'var(--teal)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
