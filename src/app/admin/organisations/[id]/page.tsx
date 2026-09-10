import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import OrgStatusForm from './org-status-form'
import UsersTable from './users-table'
import type { Member } from './types'

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

export type Member = {
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
}

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: org, error: orgErr } = await supabase
    .from('organisations').select('*').eq('id', id).single()
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
          <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--teal)', marginBottom: '4px' }}>{o.org_number ?? '—'}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{o.name}</h1>
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

      <UsersTable members={memberList} orgId={o.id} />
    </div>
  )
}
