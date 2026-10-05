'use client'

// src/components/app/member-modal.tsx
// Team member popup — same fields as the Profile popup. Used to invite a user (email editable) and to edit a member
// (email editable while the invite is pending). Admin actions: role, active / inactive, reset password, resend invite, remove.

import { useEffect, useState } from 'react'

export type TeamMember = {
  id: string
  user_id?: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  role: string
  custom_role_id?: string | null
  custom_role_name?: string | null
  invite_status: string
  phone?: string | null
  designation?: string | null
  avatar_url?: string | null
}

export const ROLE_LABELS: Record<string, string> = { admin: 'Administrator', manager: 'Manager', staff: 'Staff', read_only: 'Read Only' }
const ROLE_OPTIONS = Object.entries(ROLE_LABELS)
type CustomRoleOption = { id: string; name: string }

export default function MemberModal({ member, onClose, onDone }: {
  member: TeamMember | null            // null = invite a new user
  onClose: () => void
  onDone: (message: string) => void
}) {
  const isInvite = !member
  const pending = member?.invite_status === 'pending'
  const inactive = member?.invite_status === 'inactive'
  const emailEditable = isInvite || pending

  const [form, setForm] = useState({
    first_name: member?.first_name ?? '', last_name: member?.last_name ?? '',
    phone: member?.phone ?? '', designation: member?.designation ?? '',
    email: member?.email ?? '',
    // a fixed role, or `custom:<id>` for one of the organisation's own roles
    role: member?.custom_role_id ? `custom:${member.custom_role_id}` : member?.role ?? 'staff',
  })
  const [customRoles, setCustomRoles] = useState<CustomRoleOption[]>([])
  useEffect(() => {
    fetch('/api/org/roles').then(r => (r.ok ? r.json() : [])).then((d: CustomRoleOption[]) => setCustomRoles(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])
  const roleLabel = (v: string) => (v.startsWith('custom:') ? customRoles.find(r => `custom:${r.id}` === v)?.name ?? member?.custom_role_name ?? 'Custom role' : ROLE_LABELS[v] ?? v)
  // the API takes the fixed role plus (for custom roles) the custom role id
  const roleBody = (v: string) => (v.startsWith('custom:') ? { role: 'staff', custom_role_id: v.slice(7) } : { role: v, custom_role_id: null })
  const [roleOpen, setRoleOpen] = useState(false)
  const [ddPos, setDdPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'status' | 'remove' | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => { if (!(e.target as Element)?.closest?.('[data-dropdown]')) setRoleOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [onClose])

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const initials = ([form.first_name, form.last_name].filter(Boolean).join(' ') || form.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key); setError(null); setNotice(null)
    try {
      const res = await fetch(url, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return null }
      return data as Record<string, unknown>
    } catch { setError('Network error — please try again.'); return null }
    finally { setBusy(null) }
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  async function save() {
    if (!form.first_name.trim()) { setError('First name is required'); return }
    if (emailEditable && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setError('Enter a valid email address'); return }
    if (isInvite) {
      const d = await call('save', '/api/org/invite', json('POST', { ...form, ...roleBody(form.role), email: form.email.trim() }))
      if (d) onDone(`Invite sent to ${form.email.trim()}.`)
      return
    }
    const body: Record<string, string | null> = { first_name: form.first_name, last_name: form.last_name, phone: form.phone, designation: form.designation, ...roleBody(form.role) }
    if (pending) body.email = form.email.trim()
    const d = await call('save', `/api/org/members/${member!.id}`, json('PATCH', body))
    if (d) onDone(d.invited ? `Saved. A new invite was sent to ${d.invited}.` : 'Changes saved.')
  }

  async function resetPassword() {
    const d = await call('reset', `/api/org/members/${member!.id}/reset-password`, { method: 'POST' })
    if (d) setNotice(`A password reset link was emailed to ${d.email}.`)
  }
  async function resendInvite() {
    const d = await call('resend', '/api/org/resend-invite', json('POST', { email: member!.email }))
    if (d) setNotice(`Invite re-sent to ${member!.email}.`)
  }
  async function toggleStatus() {
    const d = await call('status', `/api/org/members/${member!.id}`, json('PATCH', { status: inactive ? 'active' : 'inactive' }))
    setConfirm(null)
    if (d) onDone(inactive ? 'User is active again.' : 'User is now inactive and can no longer sign in.')
  }
  async function remove() {
    const d = await call('remove', `/api/org/members/${member!.id}`, { method: 'DELETE' })
    setConfirm(null)
    if (d) onDone('User removed.')
  }

  const lockStyle = { opacity: 0.75, cursor: 'not-allowed' } as const
  const row = (title: string, sub: string, actions: React.ReactNode) => (
    <div style={{ border: '1.5px solid var(--gray-100)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isInvite ? 'Invite User' : [member!.first_name, member!.last_name].filter(Boolean).join(' ') || member!.email || 'Team member'}</div>
            <div className="modal-subtitle">{isInvite ? "They'll receive an email to set up their account" : pending ? 'Invite pending' : inactive ? 'Inactive — cannot sign in' : 'Active user'}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-body" onScroll={() => setRoleOpen(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>
              {member?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Users update their own photo and details from their profile.</div>
          </div>

          <div className="modal-grid-2">
            <div className="modal-field">
              <label className="modal-label">First name <span className="req">*</span></label>
              <input className="modal-input" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Last name</label>
              <input className="modal-input" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
            </div>
          </div>
          <div className="modal-grid-2">
            <div className="modal-field">
              <label className="modal-label">Phone number</label>
              <input className="modal-input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+64 21 000 0000" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Designation</label>
              <input className="modal-input" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Operations Manager" />
            </div>
          </div>
          <div className="modal-grid-2">
            <div className="modal-field">
              <label className="modal-label">Email {emailEditable && <span className="req">*</span>}</label>
              <input className="modal-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} readOnly={!emailEditable} disabled={!emailEditable}
                placeholder={isInvite ? 'colleague@example.com' : undefined} style={emailEditable ? undefined : lockStyle} />
            </div>
            <div className="modal-field" data-dropdown onClick={e => e.stopPropagation()}>
              <label className="modal-label">User level</label>
              <div style={{ position: 'relative' }}>
                <button className="modal-dd-btn" type="button" onClick={e => {
                  if (roleOpen) { setRoleOpen(false); return }
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const menuH = (4 + customRoles.length) * 36 + 70
                  const top = window.innerHeight - r.bottom < menuH + 12 ? Math.max(8, r.top - menuH - 6) : r.bottom + 6
                  setDdPos({ left: r.left, top, width: Math.max(r.width, 190) })
                  setRoleOpen(true)
                }}>
                  <span>{roleLabel(form.role)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {roleOpen && ddPos && (
                  <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', position: 'fixed', left: ddPos.left, top: ddPos.top, right: 'auto', width: ddPos.width, zIndex: 1000 }}>
                    <div className="col-dropdown-title">User level</div>
                    {ROLE_OPTIONS.map(([k, label]) => (
                      <div key={k} className={`fp-item${form.role === k ? ' active' : ''}`} onClick={() => { set('role', k); setRoleOpen(false) }}>{label}</div>
                    ))}
                    {customRoles.length > 0 && <div className="col-dropdown-title" style={{ marginTop: 6 }}>Your roles</div>}
                    {customRoles.map(r => (
                      <div key={r.id} className={`fp-item${form.role === `custom:${r.id}` ? ' active' : ''}`} onClick={() => { set('role', `custom:${r.id}`); setRoleOpen(false) }}>{r.name}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {!isInvite && !pending && (
            <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: -6 }}>Email can be changed only while the invite is pending.</div>
          )}
          {pending && (
            <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: -6 }}>Changing the email sends a fresh invite to the new address.</div>
          )}

          {!isInvite && (
            <>
              {pending && row('Invite', 'This user has not accepted yet.',
                <button type="button" className="btn btn-outline" onClick={resendInvite} disabled={busy !== null}>{busy === 'resend' ? 'Sending…' : 'Resend invite'}</button>)}
              {!pending && !inactive && row('Password', "We'll email them a secure link to set a new password.",
                <button type="button" className="btn btn-outline" onClick={resetPassword} disabled={busy !== null}>{busy === 'reset' ? 'Sending…' : 'Reset password'}</button>)}
              {!pending && row('Access', inactive ? 'Inactive — signed out and blocked until you switch them back on.' : 'Active — they can sign in. Switch off to temporarily disable access.',
                <button type="button" role="switch" aria-checked={!inactive} aria-label="Active" onClick={toggleStatus} disabled={busy !== null}
                  style={{ position: 'relative', width: 46, height: 26, borderRadius: 999, border: 'none', padding: 0, cursor: busy ? 'wait' : 'pointer', background: inactive ? 'var(--gray-200)' : 'var(--teal)', transition: 'background 150ms', opacity: busy === 'status' ? 0.6 : 1 }}>
                  <span style={{ position: 'absolute', top: 3, left: inactive ? 3 : 23, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 150ms' }} />
                </button>)}
              {row('Remove user', 'Takes them off your team completely.',
                confirm === 'remove'
                  ? <>
                      <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)} disabled={busy !== null}>Keep user</button>
                      <button type="button" className="btn btn-primary" onClick={remove} disabled={busy !== null} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}>{busy === 'remove' ? 'Removing…' : 'Yes, remove'}</button>
                    </>
                  : <button type="button" className="btn btn-outline" onClick={() => setConfirm('remove')} disabled={busy !== null} style={{ color: 'var(--danger)', borderColor: '#FECACA' }}>Remove</button>)}
            </>
          )}

          {notice && <div style={{ background: 'var(--teal-surface, #F0FDFA)', color: 'var(--teal)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 600 }}>{notice}</div>}
          {error && <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : isInvite ? 'Send invite' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
