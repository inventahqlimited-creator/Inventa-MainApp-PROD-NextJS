'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewOrganisationPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '',
    base_currency: 'NZD', timezone: 'Pacific/Auckland', status: 'active',
  })

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Organisation name is required.'); return }
    setLoading(true)

    const { data, error: insertErr } = await (supabase as any)
      .from('organisations')
      .insert({
        name:          form.name.trim(),
        slug:          form.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        email:         form.email.trim() || null,
        phone:         form.phone.trim() || null,
        address:       form.address.trim() || null,
        base_currency: form.base_currency,
        timezone:      form.timezone,
        status:        form.status,
      })
      .select('id')
      .single()

    setLoading(false)
    if (insertErr) { setError(insertErr.message); return }
    router.push(`/admin/organisations/${data.id}`)
  }

  const inputStyle = {
    width: '100%', height: '44px', padding: '0 13px',
    border: '1.5px solid var(--gray-200)', borderRadius: '10px',
    background: 'white', fontFamily: 'var(--font-ui)', fontSize: '14px',
    color: 'var(--gray-900)', outline: 'none',
  }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const labelStyle = { display: 'block' as const, fontSize: '12px', fontWeight: 600, color: 'var(--slate)', marginBottom: '6px' }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '28px' }}>
        <a href="/admin/organisations" style={{ fontSize: '13px', color: 'var(--gray-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '14px' }}>
          ← Back to Organisations
        </a>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.02em' }}>
          New Organisation
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '3px' }}>
          An Org ID will be assigned automatically.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '12px 14px', color: '#B91C1C', fontSize: '13px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', padding: '24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: '18px' }}>
            Organisation Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Organisation Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rainbow Kids Parties" required />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@company.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+64 9 000 0000" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Address</label>
              <input style={inputStyle} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, City, Postcode, Country" />
            </div>
            <div>
              <label style={labelStyle}>Base Currency</label>
              <select style={selectStyle} value={form.base_currency} onChange={e => set('base_currency', e.target.value)}>
                <option value="NZD">NZD — New Zealand Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="EUR">EUR — Euro</option>
                <option value="SGD">SGD — Singapore Dollar</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Timezone</label>
              <select style={selectStyle} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                <option value="Pacific/Auckland">Pacific/Auckland (UTC+12)</option>
                <option value="Australia/Sydney">Australia/Sydney (UTC+10)</option>
                <option value="Australia/Perth">Australia/Perth (UTC+8)</option>
                <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                <option value="Europe/London">Europe/London (UTC+0)</option>
                <option value="America/New_York">America/New_York (UTC-5)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={selectStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <a href="/admin/organisations" style={{
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
            {loading ? 'Creating…' : 'Create Organisation'}
          </button>
        </div>
      </form>
    </div>
  )
}
