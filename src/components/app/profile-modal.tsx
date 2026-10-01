'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ProfileData = {
  first_name: string
  last_name: string
  phone: string
  designation: string
  avatar_url: string
  email: string
  access: string
}

export default function ProfileModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (p: ProfileData) => void
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', designation: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/org/profile')
      .then(r => r.json())
      .then((p: ProfileData) => {
        setProfile(p)
        setForm({ first_name: p.first_name, last_name: p.last_name, phone: p.phone, designation: p.designation })
      })
      .catch(() => setError('Could not load your profile'))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const initials = ([form.first_name, form.last_name].filter(Boolean).join(' ') || profile?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setError(null); setNotice(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Only JPG, PNG or WebP images are allowed'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Photo must be under 2MB'); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/org/profile/avatar', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    setUploading(false)
    if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
    const next = { ...profile, avatar_url: data.url as string }
    setProfile(next)
    onSaved({ ...next, ...form })
  }

  async function removePhoto() {
    if (!profile) return
    setError(null); setNotice(null); setUploading(true)
    const res = await fetch('/api/org/profile/avatar', { method: 'DELETE' })
    setUploading(false)
    if (!res.ok) { setError('Could not remove photo'); return }
    const next = { ...profile, avatar_url: '' }
    setProfile(next)
    onSaved({ ...next, ...form })
  }

  async function save() {
    if (!profile) return
    setError(null); setNotice(null)
    if (!form.first_name.trim()) { setError('First name is required'); return }
    setSaving(true)
    const res = await fetch('/api/org/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Could not save'); return }
    onSaved({ ...profile, ...form })
    onClose()
  }

  async function resetPassword() {
    if (!profile?.email) return
    setError(null); setNotice(null); setResetState('sending')
    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    })
    if (err) { setResetState('idle'); setError(err.message); return }
    setResetState('sent')
    setNotice(`We've emailed a password reset link to ${profile.email}.`)
  }

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">My Profile</div>
            <div className="modal-subtitle">Your personal details</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-body">
          {!profile ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              {error ?? 'Loading…'}
            </div>
          ) : (
            <>
              {/* Photo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                  background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, opacity: uploading ? 0.5 : 1,
                }}>
                  {profile.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials}
                </div>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? 'Uploading…' : profile.avatar_url ? 'Change photo' : 'Upload photo'}
                    </button>
                    {profile.avatar_url && (
                      <button type="button" className="btn btn-outline" disabled={uploading} onClick={removePhoto}>Remove</button>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 6 }}>JPG, PNG or WebP · max 2MB</div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} style={{ display: 'none' }} />
                </div>
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
                  <label className="modal-label">Email</label>
                  <input className="modal-input" value={profile.email} readOnly disabled style={{ opacity: 0.75, cursor: 'not-allowed' }} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">User level</label>
                  <input className="modal-input" value={profile.access} readOnly disabled style={{ opacity: 0.75, cursor: 'not-allowed' }} />
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: -6 }}>
                Email and user level can only be changed by an administrator.
              </div>

              {/* Password */}
              <div style={{ border: '1.5px solid var(--gray-100)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>Password</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 2 }}>We&apos;ll email you a secure link to set a new password.</div>
                </div>
                <button type="button" className="btn btn-outline" onClick={resetPassword} disabled={resetState === 'sending' || resetState === 'sent'} style={{ flexShrink: 0 }}>
                  {resetState === 'sending' ? 'Sending…' : resetState === 'sent' ? 'Email sent' : 'Reset password'}
                </button>
              </div>

              {notice && <div style={{ background: 'var(--teal-surface, #F0FDFA)', color: 'var(--teal)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 600 }}>{notice}</div>}
              {error && <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !profile}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}
