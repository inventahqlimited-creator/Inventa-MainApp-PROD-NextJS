'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { COUNTRIES, PLANS, addMonths } from '@/lib/hub/constants'

export type OrgData = {
  id: string; name: string; email: string | null; phone: string | null; address: string | null
  country: string | null; base_currency: string; timezone: string; status: string
  xero_enabled: boolean; subscription_plan: string; user_limit: number; subscription_amount: number
  subscription_start: string | null; subscription_end: string | null
}

const input: React.CSSProperties = {
  width: '100%', height: '40px', padding: '0 12px', border: '1.5px solid var(--gray-200)', borderRadius: '9px',
  background: 'var(--hub-card)', color: 'var(--gray-900)', fontFamily: 'var(--font-ui)', fontSize: '13.5px', outline: 'none',
}
const label: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }
const card: React.CSSProperties = { background: 'var(--hub-card)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', padding: '24px', marginBottom: '20px' }
const heading: React.CSSProperties = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-400)' }
const btn = (primary: boolean, busy = false): React.CSSProperties => ({
  height: '38px', padding: '0 18px', borderRadius: '9px', fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700,
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
  border: primary ? 'none' : '1.5px solid var(--gray-200)', background: primary ? 'var(--teal)' : 'transparent', color: primary ? 'white' : 'var(--gray-400)',
})

async function patchOrg(id: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/admin/orgs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return null
  const d = await res.json().catch(() => ({}))
  return d.error || 'Could not save.'
}

export function DetailsCard({ org }: { org: OrgData }) {
  const router = useRouter()
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ name: org.name, email: org.email ?? '', phone: org.phone ?? '', address: org.address ?? '', country: org.country ?? '', base_currency: org.base_currency, timezone: org.timezone })
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true); setErr('')
    const e = await patchOrg(org.id, f)
    setBusy(false)
    if (e) { setErr(e); return }
    setEdit(false); router.refresh()
  }

  const rows: [string, string, string, string?][] = [
    ['Name', 'name', f.name], ['Email', 'email', f.email], ['Phone', 'phone', f.phone], ['Address', 'address', f.address],
    ['Country', 'country', f.country], ['Base currency', 'base_currency', f.base_currency], ['Timezone', 'timezone', f.timezone],
  ]
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div style={heading}>Organisation Details</div>
        {!edit && <button onClick={() => setEdit(true)} style={btn(false)}>Edit</button>}
      </div>
      {err && <div style={{ color: '#FCA5A5', fontSize: '13px', marginBottom: '12px' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
        {rows.map(([l, k, v]) => (
          <div key={k}>
            <div style={label}>{l}</div>
            {!edit ? (
              <div style={{ fontSize: '14px', color: v ? 'var(--slate)' : 'var(--gray-400)', fontWeight: v ? 500 : 400 }}>{v || '—'}</div>
            ) : k === 'country' ? (
              <select style={input} value={v} onChange={e => set(k, e.target.value)}>
                <option value="">—</option>
                {[...new Set([...(v ? [v] : []), ...COUNTRIES])].map(c => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <input style={input} value={v} onChange={e => set(k, e.target.value)} />
            )}
          </div>
        ))}
      </div>
      {edit && (
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={() => { setEdit(false); setErr('') }} style={btn(false)}>Cancel</button>
          <button onClick={save} disabled={busy} style={btn(true, busy)}>{busy ? 'Saving…' : 'Save details'}</button>
        </div>
      )}
    </div>
  )
}

export function SubscriptionCard({ org, used }: { org: OrgData; used: number }) {
  const router = useRouter()
  const [f, setF] = useState({
    status: org.status, subscription_plan: org.subscription_plan, user_limit: String(org.user_limit),
    subscription_amount: String(org.subscription_amount ?? 0), subscription_start: org.subscription_start ?? '', subscription_end: org.subscription_end ?? '',
  })
  const [xero, setXero] = useState(org.xero_enabled)
  const [busy, setBusy] = useState(false)
  const [xBusy, setXBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function change(k: string, v: string) {
    setF(p => {
      const n = { ...p, [k]: v }
      if (k === 'subscription_plan' || k === 'subscription_start') {
        const months = PLANS.find(x => x.value === n.subscription_plan)?.months ?? 1
        if (n.subscription_start) n.subscription_end = addMonths(n.subscription_start, months)
      }
      return n
    })
  }

  async function save() {
    setBusy(true); setMsg(null)
    const e = await patchOrg(org.id, {
      status: f.status, subscription_plan: f.subscription_plan, user_limit: Number(f.user_limit),
      subscription_amount: Number(f.subscription_amount || 0),
      subscription_start: f.subscription_start || null, subscription_end: f.subscription_end || null,
    })
    setBusy(false)
    if (e) { setMsg({ ok: false, text: e }); return }
    setMsg({ ok: true, text: 'Saved.' }); router.refresh()
  }

  async function toggleXero() {
    setXBusy(true); setMsg(null)
    const want = !xero
    const e = await patchOrg(org.id, { xero_enabled: want })
    setXBusy(false)
    if (e) { setMsg({ ok: false, text: e }); return }
    setXero(want); router.refresh()
  }

  return (
    <div style={card}>
      <div style={{ ...heading, marginBottom: '18px' }}>Subscription &amp; Package</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px' }}>
        <div>
          <label style={label}>Subscription type</label>
          <select style={input} value={f.subscription_plan} onChange={e => change('subscription_plan', e.target.value)}>
            {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Users included ({used} in use)</label>
          <input style={input} type="number" min={1} step={1} value={f.user_limit} onChange={e => change('user_limit', e.target.value)} />
        </div>
        <div>
          <label style={label}>Total amount (AUD)</label>
          <input style={input} type="number" min={0} step="0.01" value={f.subscription_amount} onChange={e => change('subscription_amount', e.target.value)} />
        </div>
        <div>
          <label style={label}>Status</label>
          <select style={input} value={f.status} onChange={e => change('status', e.target.value)}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
          </select>
        </div>
        <div>
          <label style={label}>Start date</label>
          <input style={input} type="date" value={f.subscription_start} onChange={e => change('subscription_start', e.target.value)} />
        </div>
        <div>
          <label style={label}>End date</label>
          <input style={input} type="date" value={f.subscription_end} onChange={e => change('subscription_end', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--gray-100)' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--slate)' }}>Xero integration</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {xero ? 'Shows as “Installed” in their Settings → Integrations.' : 'Shows as “Talk to sales” in their Settings → Integrations.'}
          </div>
        </div>
        <button onClick={toggleXero} disabled={xBusy} role="switch" aria-checked={xero} aria-label="Xero integration" style={{
          width: '48px', height: '26px', borderRadius: '999px', border: 'none', padding: '3px', cursor: xBusy ? 'wait' : 'pointer',
          background: xero ? '#8B5CF6' : 'rgba(255,255,255,0.14)', transition: 'background 150ms', display: 'flex', justifyContent: xero ? 'flex-end' : 'flex-start',
        }}>
          <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white' }} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '20px' }}>
        {msg && <span style={{ fontSize: '13px', color: msg.ok ? '#6EE7B7' : '#FCA5A5' }}>{msg.text}</span>}
        <button onClick={save} disabled={busy} style={btn(true, busy)}>{busy ? 'Saving…' : 'Save subscription'}</button>
      </div>
    </div>
  )
}
