'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Member = {
  id: string
  user_id: string | null
  first_name: string | null
  last_name: string | null
  email: string
  role: string
  invite_status: string
  invited_at: string | null
  accepted_at: string | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  read_only: 'Read only',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-teal-500/15 text-teal-300',
  manager: 'bg-blue-500/15 text-blue-300',
  staff: 'bg-slate-500/15 text-slate-300',
  read_only: 'bg-slate-500/10 text-slate-400',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function displayName(m: Member) {
  if (m.first_name || m.last_name) return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()
  return null
}

export default function MembersTable({
  members,
  currentUserId,
  isAdmin,
}: {
  members: Member[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changeRoleTarget, setChangeRoleTarget] = useState<Member | null>(null)
  const [newRole, setNewRole] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('staff')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  async function handleResend(email: string) {
    setLoading(`resend-${email}`)
    setError(null)
    const res = await fetch('/api/org/resend-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    setLoading(null)
    if (!res.ok) setError(data.error)
    else router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this member from your organisation?')) return
    setLoading(`delete-${id}`)
    setError(null)
    const res = await fetch(`/api/org/members/${id}`, { method: 'DELETE' })
    const data = await res.json()
    setLoading(null)
    if (!res.ok) setError(data.error)
    else router.refresh()
  }

  async function handleRoleChange() {
    if (!changeRoleTarget || !newRole) return
    setLoading(`role-${changeRoleTarget.id}`)
    setError(null)
    const res = await fetch(`/api/org/members/${changeRoleTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    const data = await res.json()
    setLoading(null)
    if (!res.ok) {
      setError(data.error)
    } else {
      setChangeRoleTarget(null)
      router.refresh()
    }
  }

  async function handleInvite() {
    setInviteError(null)
    setLoading('invite')
    const res = await fetch('/api/org/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    const data = await res.json()
    setLoading(null)
    if (!res.ok) {
      setInviteError(data.error)
    } else {
      setInviteSuccess(true)
      setInviteEmail('')
      setTimeout(() => {
        setShowInvite(false)
        setInviteSuccess(false)
        router.refresh()
      }, 1500)
    }
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-400">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
        {isAdmin && (
          <button
            onClick={() => {
              setShowInvite(true)
              setInviteError(null)
              setInviteSuccess(false)
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: 'var(--teal)' }}
          >
            Invite member
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b border-white/8"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Member</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Role</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Joined</th>
              {isAdmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.user_id === currentUserId
              const isPending = m.invite_status === 'pending'
              return (
                <tr
                  key={m.id}
                  className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/2"
                >
                  <td className="px-5 py-4">
                    <div className="font-medium text-white">
                      {displayName(m) ?? (
                        <span className="text-slate-500 italic">Invited</span>
                      )}
                      {isSelf && (
                        <span className="ml-2 text-xs text-slate-500">(you)</span>
                      )}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">{m.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[m.role] ?? ''}`}
                    >
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {isPending ? (
                      <span className="inline-flex items-center gap-1.5 text-amber-400 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        Invite pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs">
                    {formatDate(m.accepted_at ?? m.invited_at)}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4">
                      {!isSelf && (
                        <div className="flex items-center justify-end gap-3">
                          {isPending && (
                            <button
                              onClick={() => handleResend(m.email)}
                              disabled={loading === `resend-${m.email}`}
                              className="text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                            >
                              {loading === `resend-${m.email}` ? 'Sending…' : 'Resend invite'}
                            </button>
                          )}
                          {!isPending && (
                            <button
                              onClick={() => {
                                setChangeRoleTarget(m)
                                setNewRole(m.role)
                              }}
                              className="text-xs text-slate-400 hover:text-white transition-colors"
                            >
                              Change role
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(m.id)}
                            disabled={loading === `delete-${m.id}`}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                          >
                            {loading === `delete-${m.id}` ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {members.length === 0 && (
          <div className="px-5 py-12 text-center text-slate-500 text-sm">
            No members yet. Invite someone to get started.
          </div>
        )}
      </div>

      {/* Change role modal */}
      {changeRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 p-6"
            style={{ background: 'var(--slate)' }}
          >
            <h2 className="text-base font-semibold text-white mb-1">Change role</h2>
            <p className="text-sm text-slate-400 mb-5">
              {displayName(changeRoleTarget) ?? changeRoleTarget.email}
            </p>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-white/10 bg-white/5 mb-5 focus:outline-none focus:border-teal-500"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="read_only">Read only</option>
            </select>
            {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setChangeRoleTarget(null); setError(null) }}
                className="flex-1 py-2.5 rounded-lg text-sm text-slate-400 border border-white/10 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                disabled={
                  loading === `role-${changeRoleTarget.id}` ||
                  newRole === changeRoleTarget.role
                }
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 hover:opacity-90"
                style={{ background: 'var(--teal)' }}
              >
                {loading === `role-${changeRoleTarget.id}` ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 p-6"
            style={{ background: 'var(--slate)' }}
          >
            <h2 className="text-base font-semibold text-white mb-1">Invite a team member</h2>
            <p className="text-sm text-slate-400 mb-5">
              They'll receive an email to set up their account.
            </p>
            {inviteSuccess ? (
              <div className="py-6 text-center text-emerald-400 text-sm">
                Invite sent ✓
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-white/10 bg-white/5 focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
                  />
                </div>
                <div className="mb-5">
                  <label className="block text-xs text-slate-400 mb-1.5">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-white/10 bg-white/5 focus:outline-none focus:border-teal-500"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                    <option value="read_only">Read only</option>
                  </select>
                </div>
                {inviteError && (
                  <p className="text-red-400 text-xs mb-4">{inviteError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowInvite(false)
                      setInviteEmail('')
                      setInviteError(null)
                    }}
                    className="flex-1 py-2.5 rounded-lg text-sm text-slate-400 border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvite}
                    disabled={loading === 'invite' || !inviteEmail}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 hover:opacity-90"
                    style={{ background: 'var(--teal)' }}
                  >
                    {loading === 'invite' ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
