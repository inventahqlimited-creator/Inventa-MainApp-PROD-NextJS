'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function UsersTable(props: { members: any[], orgId: string }) {
  const members = props.members
  const orgId = props.orgId
  const [resending, setResending] = useState('')
  const [resent, setResent] = useState('')
  const [error, setError] = useState('')

  async function handleResend(member: any) {
    if (!member.email) return
    setResending(member.id)
    setError('')
    const res = await fetch('/api/admin/resend-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: member.email, orgId, role: member.role }),
    })
    setResending('')
    if (res.ok) {
      setResent(member.id)
      setTimeout(() => setResent(''), 3000)
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to resend invite.')
    }
  }

  const statusBg: any = { pending: '#EFF6FF', accepted: '#D1FAE5' }
  const statusColor: any = { pending: '#1E40AF', accepted: '#065F46' }

  return (
    <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--gray-100)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--slate)' }}>Users</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>
            {members.length} member{members.length !== 1 ? 's' : ''} · {members.filter((m: any) => m.invite_status === 'pending').length} pending
          </div>
        </div>
        <Link href={`/admin/organisations/${orgId}/users/invite`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'var(--teal)', color: 'white', textDecoration: 'none',
          padding: '0 14px', height: '36px', borderRadius: '9px',
          fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-display)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Invite User
        </Link>
      </div>
      {error && (
        <div style={{ padding: '12px 24px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', fontSize: '13px', color: '#B91C1C' }}>
          {error}
        </div>
      )}
      {members.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
          No users yet. Invite the first user to get started.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
              {['Name', 'Email', 'Role', 'Status', 'Invited', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m: any, i: number) => {
              const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ') || '—'
              const isPending = m.invite_status === 'pending'
              const isResending = resending === m.id
              const isResent = resent === m.id
              return (
                <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: 'var(--slate)', fontSize: '13.5px' }}>{fullName}</td>
                  <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>{m.email ?? '—'}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate)', background: 'var(--gray-100)', padding: '3px 8px', borderRadius: '6px' }}>
                      {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: statusBg[m.invite_status] ?? '#F3F4F6', color: statusColor[m.invite_status] ?? '#6B7280' }}>
                      {m.invite_status.charAt(0).toUpperCase() + m.invite_status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', color: 'var(--gray-400)', fontSize: '13px' }}>
                    {m.invited_at ? new Date(m.invited_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                    {isPending && (
                      <button onClick={() => handleResend(m)} disabled={!!isResending} style={{
                        height: '30px', padding: '0 12px', borderRadius: '7px',
                        border: isResent ? '1.5px solid #0D9488' : '1.5px solid var(--gray-200)',
                        background: isResent ? '#F0FAFA' : 'white',
                        color: isResent ? '#0D9488' : '#9CA3AF',
                        fontSize: '12px', fontWeight: 600, cursor: isResending ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font-ui)', transition: 'all 150ms', opacity: isResending ? 0.6 : 1,
                      }}>
                        {isResending ? 'Sending…' : isResent ? '✓ Sent' : 'Resend invite'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
