'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Adjustment = {
  id: string
  adj_number: string | null
  location_id: string | null
  location_name: string | null
  status: string
  adjustment_date: string | null
  reason: string | null
  notes: string | null
}

type Line = {
  id: string
  product_id: string | null
  product_name: string | null
  product_sku: string | null
  unit: string | null
  quantity_before: number
  quantity_after: number
  reason: string | null
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft">{status}</span>
  if (s === 'completed') return <span className="badge badge-closed">{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled">{status}</span>
  return <span className="badge badge-draft">{status}</span>
}

export default function ViewAdjustment({
  adjustment: initialAdj,
  lines,
  orgId,
}: {
  adjustment: Adjustment
  lines: Line[]
  orgId: string
}) {
  const router = useRouter()
  const [adj, setAdj] = useState(initialAdj)
  const [saving, setSaving] = useState(false)

  const canComplete = adj.status.toLowerCase() === 'draft'
  const canCancel = adj.status.toLowerCase() === 'draft'

  async function updateStatus(status: string) {
    setSaving(true)
    const res = await fetch(`/api/org/adjustments/${adj.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSaving(false)
    if (res.ok) setAdj(prev => ({ ...prev, status }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/products/adjustments')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>{adj.adj_number ?? 'Adjustment'}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>{adj.location_name} · {fmtDate(adj.adjustment_date)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusBadge(adj.status)}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>

        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Adjustment Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div className="modal-field">
              <label className="modal-label">Location</label>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)', padding: '4px 0' }}>{adj.location_name ?? '—'}</div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Date</label>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(adj.adjustment_date)}</div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Reason</label>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{adj.reason ?? '—'}</div>
            </div>
            {adj.notes && (
              <div className="modal-field" style={{ gridColumn: 'span 3' }}>
                <label className="modal-label">Notes</label>
                <div style={{ fontSize: 13, color: 'var(--slate)', padding: '4px 0', lineHeight: 1.5 }}>{adj.notes}</div>
              </div>
            )}
          </div>
        </div>

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
                <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Before</th>
                <th className="li-th" style={{ width: 110, textAlign: 'right' }}>After</th>
                <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Change</th>
                <th className="li-th" style={{ width: 130 }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No products.</td></tr>
              )}
              {lines.map(l => {
                const change = l.quantity_after - l.quantity_before
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                    <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span></td>
                    <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{l.unit ?? '—'}</td>
                    <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.quantity_before}</td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{l.quantity_after}</td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 700, color: change > 0 ? '#059669' : change < 0 ? 'var(--danger)' : 'var(--gray-400)' }}>
                      {change > 0 ? `+${change}` : change}
                    </td>
                    <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 12.5 }}>{l.reason ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => router.push('/products/adjustments')} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          {canCancel && (
            <button className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => { if (confirm('Cancel this adjustment?')) updateStatus('Cancelled') }} disabled={saving}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Cancel
            </button>
          )}
        </div>
        {canComplete && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }}
            onClick={() => { if (confirm('Mark as completed? Stock levels will be updated.')) updateStatus('Completed') }} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Saving…' : 'Complete Adjustment'}
          </button>
        )}
      </div>
    </div>
  )
}
