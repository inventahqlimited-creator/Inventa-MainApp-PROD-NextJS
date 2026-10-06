'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtDate, fmtDateTime } from '@/lib/hub/constants'

export type MemberRow = {
  id: string; first_name: string | null; last_name: string | null; email: string | null
  role: string; invite_status: string; invited_at: string | null; last_login: string | null
}

const ROLES = [['admin', 'Admin'], ['manager', 'Manager'], ['staff', 'Staff'], ['read_only', 'Read only']]
const roleName = (r: string) => ROLES.find(x => x[0] === r)?.[1] ?? r
const statusBg: Record<string, string> = { pending: 'rgba(59,130,246,0.15)', accepted: 'rgba(16,185,129,0.15)' }
const statusColor: Record<string, string> = { pending: '#93C5FD', accepted: '#6EE7B7' }

const cell: React.CSSProperties = { padding: '13px 16px', fontSize: '13px', color: 'var(--gray-400)', whiteSpace: 'nowrap' }
const field: React.CSSProperties = {
  height: '34px', padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: '8px', background: 'var(--hub-card)',
  color: 'var(--gray-900)', fontFamily: 'var(--font-ui)', fontSize: '13px', outline: 'none', width: '100%', minWidth: '90px',
}
const small = (primary: boolean, off = false): React.CSSProperties => ({
  height: '30px', padding: '0 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ui)',
  cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.6 : 1,
  border: primary ? 'none' : '1.5px solid var(--gray-200)', background: primary ? 'var(--teal)' : 'transparent', color: primary ? 'white' : 'var(--gray-400)',
})

export default function UsersTable({ members, orgId, limit }: { members: MemberRow[]; orgId: string; limit: number | null }) {
  const router = useRouter()
  const [resending, setResending] = useState('')
  const [resent, setResent] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState('')
  const [draft, setDraft] = useState({ first_name: '', last_name: '', role: 'staff' })
  const [saving, setSaving] = useState(false)

  const used = members.filter(m => m.invite_status === 'accepted' || m.invite_status === 'pending').length
  const full = limit !== null && used >= limit

  async function handleResend(m: MemberRow) {
    if (!m.email) return
    setResending(m.id); setError('')
    const res = await fetch('/api/admin/resend-invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: m.email, orgId, role: m.role }),
    })
    setResending('')
    if (res.ok) { setResent(m.id); setTimeout(() => setResent(''), 3000) }
    else setError((await res.json().catch(() => ({}))).error || 'Failed to resend invite.')
  }

  function startEdit(m: MemberRow) {
    setError(''); setEditing(m.id)
    setDraft({ first_name: m.first_name ?? '', last_name: m.last_name ?? '', role: m.role })
  }

  async function saveEdit(m: MemberRow) {
    setSaving(true); setError('')
    const res = await fetch(`/api/admin/orgs/${orgId}/members/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Could not save.'); return }
    setEditing(''); router.refresh()
  }

  return (
    <div style={{ background: 'var(--hub-card)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--gray-100)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--slate)' }}>Users</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {used}{limit !== null ? ` of ${limit}` : ''} used · {members.filter(m => m.invite_status === 'accepted').length} active · {members.filter(m => m.invite_status === 'pending').length} pending
          </div>
        </div>
        {full ? (
          <span style={{ fontSize: '12px', color: '#FCD34D' }}>User limit reached — raise it under Subscription to invite more</span>
        ) : (
          <Link href={`/admin/organisations/${orgId}/users/invite`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--teal)', color: 'white', textDecoration: 'none',
            padding: '0 14px', height: '36px', borderRadius: '9px', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-display)',
          }}>+ Invite User</Link>
        )}
      </div>

      {error && <div style={{ padding: '12px 24px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.35)', fontSize: '13px', color: '#FCA5A5' }}>{error}</div>}

      {members.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>No users yet. Invite the first user to get started.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                {['Name', 'Email', 'Role', 'Status', 'Last login', 'Invited', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isEditing = editing === m.id
                const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ') || '—'
                return (
                  <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <td style={{ ...cell, color: 'var(--slate)', fontWeight: 600, fontSize: '13.5px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input style={field} value={draft.first_name} placeholder="First" onChange={e => setDraft(d => ({ ...d, first_name: e.target.value }))} />
                          <input style={field} value={draft.last_name} placeholder="Last" onChange={e => setDraft(d => ({ ...d, last_name: e.target.value }))} />
                        </div>
                      ) : fullName}
                    </td>
                    <td style={cell}>{m.email ?? '—'}</td>
                    <td style={cell}>
                      {isEditing ? (
                        <select style={field} value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}>
                          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--slate)', background: 'var(--gray-100)', padding: '3px 8px', borderRadius: '6px' }}>{roleName(m.role)}</span>
                      )}
                    </td>
                    <td style={cell}>
                      <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: statusBg[m.invite_status] ?? 'rgba(148,163,184,0.15)', color: statusColor[m.invite_status] ?? '#CBD5E1' }}>
                        {m.invite_status.charAt(0).toUpperCase() + m.invite_status.slice(1)}
                      </span>
                    </td>
                    <td style={cell}>{m.invite_status === 'accepted' ? (m.last_login ? fmtDateTime(m.last_login) : 'Never') : '—'}</td>
                    <td style={cell}>{fmtDate(m.invited_at)}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditing('')} style={small(false)}>Cancel</button>
                          <button onClick={() => saveEdit(m)} disabled={saving} style={small(true, saving)}>{saving ? 'Saving…' : 'Save'}</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {m.invite_status === 'pending' && (
                            <button onClick={() => handleResend(m)} disabled={resending === m.id} style={small(false, resending === m.id)}>
                              {resending === m.id ? 'Sending…' : resent === m.id ? '✓ Sent' : 'Resend invite'}
                            </button>
                          )}
                          <button onClick={() => startEdit(m)} style={small(false)}>Edit</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
