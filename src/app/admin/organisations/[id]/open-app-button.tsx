'use client'

import { useState } from 'react'

export default function OpenAppButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function open() {
    setBusy(true); setErr('')
    // open the tab straight away (inside the click) so the browser doesn't treat it as a pop-up
    const tab = window.open('', '_blank')
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/open-app`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.url) throw new Error(d.error || 'Could not open InventaHQ.')
      if (tab) tab.location.href = d.url
      else window.location.href = d.url
    } catch (e) {
      tab?.close()
      setErr(e instanceof Error ? e.message : 'Could not open InventaHQ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      <button onClick={open} disabled={busy} style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 18px', borderRadius: '10px', border: 'none',
        background: 'var(--teal)', color: 'white', fontFamily: 'var(--font-display)', fontSize: '13.5px', fontWeight: 700,
        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, boxShadow: '0 4px 14px rgba(139,92,246,0.25)',
      }}>
        {busy ? 'Opening…' : 'Open InventaHQ'}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      {err && <span style={{ fontSize: '12px', color: '#FCA5A5', maxWidth: '260px', textAlign: 'right' }}>{err}</span>}
    </div>
  )
}
