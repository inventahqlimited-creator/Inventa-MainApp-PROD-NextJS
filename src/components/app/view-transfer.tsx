'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Transfer = {
  id: string
  tr_number: string | null
  from_location_id: string | null
  to_location_id: string | null
  from_location_name: string | null
  to_location_name: string | null
  status: string
  transfer_date: string | null
  expected_date: string | null
  notes: string | null
}

type Line = {
  id: string
  product_id: string | null
  product_name: string | null
  product_sku: string | null
  unit: string | null
  quantity: number
  quantity_received: number | null
}

type Location = { id: string; name: string }

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft">{status}</span>
  if (s === 'in transit') return <span className="badge badge-open">{status}</span>
  if (s === 'completed') return <span className="badge badge-closed">{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled">{status}</span>
  return <span className="badge badge-draft">{status}</span>
}

export default function ViewTransfer({
  transfer: initialTransfer,
  lines,
  locations,
  orgId,
}: {
  transfer: Transfer
  lines: Line[]
  locations: Location[]
  orgId: string
}) {
  const router = useRouter()
  const [transfer, setTransfer] = useState(initialTransfer)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editFromId, setEditFromId] = useState(transfer.from_location_id ?? '')
  const [editFromName, setEditFromName] = useState(transfer.from_location_name ?? '')
  const [editToId, setEditToId] = useState(transfer.to_location_id ?? '')
  const [editToName, setEditToName] = useState(transfer.to_location_name ?? '')
  const [editDate, setEditDate] = useState(transfer.transfer_date ?? '')
  const [editExpected, setEditExpected] = useState(transfer.expected_date ?? '')
  const [editNotes, setEditNotes] = useState(transfer.notes ?? '')
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  const canEdit = !['completed', 'cancelled'].includes(transfer.status.toLowerCase())
  const canComplete = transfer.status.toLowerCase() === 'in transit'
  const canCancel = !['completed', 'cancelled'].includes(transfer.status.toLowerCase())

  async function saveEdits() {
    setSaving(true)
    setError(null)
    const payload = {
      from_location_id: editFromId || null,
      to_location_id: editToId || null,
      from_location_name: editFromName || null,
      to_location_name: editToName || null,
      transfer_date: editDate || null,
      expected_date: editExpected || null,
      notes: editNotes || null,
    }
    const res = await fetch(`/api/org/transfers/${transfer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
    setTransfer(prev => ({ ...prev, ...payload }))
    setMode('view')
  }

  async function updateStatus(status: string) {
    const res = await fetch(`/api/org/transfers/${transfer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) setTransfer(prev => ({ ...prev, status }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setFromOpen(false); setToOpen(false) }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/transfers')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>{transfer.tr_number ?? 'Transfer'}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              {transfer.from_location_name} → {transfer.to_location_name} · {fmtDate(transfer.transfer_date)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusBadge(transfer.status)}
          {mode === 'view' && canEdit && (
            <button className="btn btn-outline" style={{ height: 36 }} onClick={() => setMode('edit')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={() => { setFromOpen(false); setToOpen(false) }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}

        {/* Locations */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, marginBottom: 20, alignItems: 'center' }}>
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              From
            </div>
            {mode === 'view' ? (
              <div style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{transfer.from_location_name ?? '—'}</div>
              </div>
            ) : (
              <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <button className="modal-dd-btn" onClick={() => setFromOpen(o => !o)} type="button">
                  <span>{editFromName || 'Select…'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {fromOpen && (
                  <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 200 }}>
                    {locations.map(l => (
                      <div key={l.id} className={`fp-item${editFromId === l.id ? ' active' : ''}`} style={{ opacity: l.id === editToId ? 0.4 : 1 }}
                        onClick={() => { if (l.id !== editToId) { setEditFromId(l.id); setEditFromName(l.name); setFromOpen(false) } }}>{l.name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>

          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              To
            </div>
            {mode === 'view' ? (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{transfer.to_location_name ?? '—'}</div>
              </div>
            ) : (
              <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <button className="modal-dd-btn" onClick={() => setToOpen(o => !o)} type="button">
                  <span>{editToName || 'Select…'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {toOpen && (
                  <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 200 }}>
                    {locations.map(l => (
                      <div key={l.id} className={`fp-item${editToId === l.id ? ' active' : ''}`} style={{ opacity: l.id === editFromId ? 0.4 : 1 }}
                        onClick={() => { if (l.id !== editFromId) { setEditToId(l.id); setEditToName(l.name); setToOpen(false) } }}>{l.name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Transfer Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="modal-field">
              <label className="modal-label">Transfer Date</label>
              {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(transfer.transfer_date)}</div>
                : <input className="modal-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ background: 'var(--white)' }} />}
            </div>
            <div className="modal-field">
              <label className="modal-label">Expected Arrival</label>
              {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(transfer.expected_date)}</div>
                : <input className="modal-input" type="date" value={editExpected} onChange={e => setEditExpected(e.target.value)} style={{ background: 'var(--white)' }} />}
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Notes</label>
              {mode === 'view' ? <div style={{ fontSize: 13, color: transfer.notes ? 'var(--slate)' : 'var(--gray-400)', padding: '4px 0', lineHeight: 1.5 }}>{transfer.notes || '—'}</div>
                : <textarea className="modal-input" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }} />}
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="npo-card">
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Products
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th className="li-th" style={{ width: 120 }}>Item Code</th>
                <th className="li-th">Product</th>
                <th className="li-th" style={{ width: 80, textAlign: 'center' }}>Unit</th>
                <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Quantity</th>
                <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Received</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No products.</td></tr>
              )}
              {lines.map(l => {
                const received = l.quantity_received ?? 0
                const remaining = l.quantity - received
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                    <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span></td>
                    <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{l.unit ?? '—'}</td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{l.quantity}</td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : '#059669' }}>{received}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {mode === 'view' ? (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => router.push('/transfers')} className="btn btn-outline" style={{ height: 38 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              {canCancel && (
                <button className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => { if (confirm('Cancel this transfer?')) updateStatus('Cancelled') }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  Cancel Transfer
                </button>
              )}
            </div>
            {canComplete && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }}
                onClick={() => { if (confirm('Mark this transfer as completed?')) updateStatus('Completed') }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mark Completed
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => setMode('view')} className="btn btn-outline" style={{ height: 38 }}>Cancel</button>
            <button onClick={saveEdits} className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
