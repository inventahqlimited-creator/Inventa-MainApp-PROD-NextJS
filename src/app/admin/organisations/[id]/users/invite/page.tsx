'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function InviteUserPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.id as string

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', role: 'staff',
  })

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (!form.first_name.trim()) { setError('First name is required.'); return }
    setLoading(true)

    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     form.email.trim(),
          orgId,
          role:      form.role,
          firstName: form.first_name.trim(),
          lastName:  form.last_name.trim() || null,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Failed to send invite.')
        setLoading(false)
        return
      }

      router.push(`/admin/organisations/${orgId}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', height: '44px', padding: '0 13px',
    border: '1.5px solid var(--gray-200)', borderRadius: '10px',
    background: 'white', fontFamily: 'var(--font-ui)', fontSize: '14px',
    color: 'var(--gray-900)', outline: 'none',
  }

  const labelStyle = {
    display: 'block' as const, fontSize: '12px', fontWeight: 600,
    color: 'var(--slate)', marginBottom: '6px',
  }

  return (
    <div style={{ maxWidth: '520px' }}>
      <a href={`/admin/organisations/${orgId}`} style={{ fontSize: '13px', color: 'var(--gray-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '16px' }}>
        ← Back to Organisation
      </a>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
        Invite User
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '24px' }}>
        They&apos;ll receive an email to set their password and join the organisation.
      </p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '12px 14px', color: '#B91C1C', fontSize: '13px', marginBottom: '18px' }}>
            {error}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', padding: '24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: '18px' }}>
            User Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input style={inputStyle} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Jane" required />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input style={inputStyle} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Email Address *</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" required />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Role</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="admin">Admin — Full access including user management</option>
                <option value="manager">Manager — Can manage orders and products</option>
                <option value="staff">Staff — Standard access</option>
                <option value="read_only">Read Only — View only</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <a href={`/admin/organisations/${orgId}`} style={{
            height: '42px', padding: '0 20px', borderRadius: '10px', border: '1.5px solid var(--gray-200)',
            background: 'white', color: 'var(--gray-400)', fontSize: '13.5px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
          }}>Cancel</a>
          <button type="submit" disabled={loading} style={{
            height: '42px', padding: '0 24px', borderRadius: '10px', border: 'none',
            background: 'var(--teal)', color: 'white', fontSize: '13.5px', fontWeight: 700,
            fontFamily: 'var(--font-display)', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1, boxShadow: '0 4px 14px rgba(13,148,136,0.25)',
          }}>
            {loading ? 'Sending invite…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </div>
  )
}
