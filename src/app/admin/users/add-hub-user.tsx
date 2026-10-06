'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const input: React.CSSProperties = {
  width: '100%', height: '42px', padding: '0 12px', border: '1.5px solid var(--gray-200)', borderRadius: '10px',
  background: 'var(--hub-card)', color: 'var(--gray-900)', fontFamily: 'var(--font-ui)', fontSize: '14px', outline: 'none',
}
const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--slate)', marginBottom: '6px' }

export default function AddHubUser() {
  const router = useRouter()
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setOk('')
    const res = await fetch('/api/admin/hub-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error || 'Could not add the user.'); return }
    setOk(`${f.email} can now sign in at the Hub.`)
    setF({ first_name: '', last_name: '', email: '', password: '' })
    router.refresh()
  }

  return (
    <form onSubmit={submit} style={{ background: 'var(--hub-card)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: '18px' }}>Add a Hub user</div>
      {err && <div style={{ color: '#FCA5A5', fontSize: '13px', marginBottom: '12px' }}>{err}</div>}
      {ok && <div style={{ color: '#6EE7B7', fontSize: '13px', marginBottom: '12px' }}>{ok}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div><label style={label}>First name *</label><input style={input} value={f.first_name} onChange={e => set('first_name', e.target.value)} required /></div>
        <div><label style={label}>Last name</label><input style={input} value={f.last_name} onChange={e => set('last_name', e.target.value)} /></div>
        <div><label style={label}>Email *</label><input style={input} type="email" value={f.email} onChange={e => set('email', e.target.value)} required autoComplete="off" /></div>
        <div>
          <label style={label}>Password * <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(12+ characters, upper, lower, number)</span></label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input style={input} type={show ? 'text' : 'password'} value={f.password} onChange={e => set('password', e.target.value)} required autoComplete="new-password" />
            <button type="button" onClick={() => setShow(s => !s)} style={{ ...input, width: 'auto', padding: '0 12px', cursor: 'pointer', color: 'var(--gray-400)', background: 'transparent' }}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button type="submit" disabled={busy} style={{ height: '40px', padding: '0 22px', borderRadius: '10px', border: 'none', background: 'var(--teal)', color: 'white', fontFamily: 'var(--font-display)', fontSize: '13.5px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Adding…' : 'Add Hub user'}
        </button>
      </div>
    </form>
  )
}
