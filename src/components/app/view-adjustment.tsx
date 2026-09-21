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
  batch_number: string | null
  serial_number: string | null
  expiry_date: string | null
}

type TrackingFlags = {
  showSerial: boolean
  showBatch: boolean
  showExpiry: boolean
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

// Bug 6 fix: In-app confirm modal instead of browser confirm()
function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel: string
  confirmClass?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={onCancel}>Keep editing</button>
          <button className={`btn ${confirmClass ?? 'btn-primary'}`} style={{ height: 38, padding: '0 20px' }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default function ViewAdjustment({
  adjustment: initialAdj,
  lines,
  orgId,
  trackingFlags = { showSerial: false, showBatch: false, showExpiry: false },
}: {
  adjustment: Adjustment
  lines: Line[]
  orgId: string
  trackingFlags?: TrackingFlags
}) {
  const router = useRouter()
  const [adj, setAdj] = useState(initialAdj)
  const [saving, setSaving] = useState(false)
  // Bug 6 fix: modal state instead of browser confirm()
  const [modal, setModal] = useState<'cancel' | 'complete' | null>(null)

  const canComplete = adj.status.toLowerCase() === 'draft'
  const canCancel = adj.status.toLowerCase() === 'draft'
  // Bug 5 fix: draft adjustments are editable
  const isDraft = adj.status.toLowerCase() === 'draft'

  async function updateStatus(status: string) {
    setSaving(true)
    setModal(null)
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

      {/* Bug 6 fix: in-app cancel modal */}
      {modal === 'cancel' && (
        <ConfirmModal
          title="Cancel Adjustment"
          message="Are you sure you want to cancel this adjustment? This action cannot be undone."
          confirmLabel="Yes, Cancel"
          confirmClass="btn btn-outline"
          onConfirm={() => updateStatus('Cancelled')}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Bug 6 fix: in-app complete modal */}
      {modal === 'complete' && (
        <ConfirmModal
          title="Complete Adjustment"
          message="This will apply the quantity changes to your stock levels. Are you sure?"
          confirmLabel="Complete Adjustment"
          onConfirm={() => updateStatus('Completed')}
          onCancel={() => setModal(null)}
        />
      )}

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
                <th className="li-th" style={{ width: 120 }}>SKU</th>
                <th className="li-th">Product</th>
                <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Before</th>
                <th className="li-th" style={{ width: 110, textAlign: 'right' }}>After</th>
                <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Change</th>
                <th className="li-th" style={{ width: 130 }}>Reason</th>
                {trackingFlags.showBatch  && <th className="li-th" style={{ width: 120 }}>Batch / Lot</th>}
                {trackingFlags.showSerial && <th className="li-th" style={{ width: 120 }}>Serial #</th>}
                {trackingFlags.showExpiry && <th className="li-th" style={{ width: 110 }}>Expiry Date</th>}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={7 + (trackingFlags.showBatch ? 1 : 0) + (trackingFlags.showSerial ? 1 : 0) + (trackingFlags.showExpiry ? 1 : 0)} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No products.</td></tr>
              )}
              {lines.map(l => {
                const change = l.quantity_after - l.quantity_before
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                    <td className="li-td">
                      <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span>
                    </td>
                    <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{l.unit ?? '—'}</td>
                    <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.quantity_before}</td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{l.quantity_after}</td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 700, color: change > 0 ? '#059669' : change < 0 ? 'var(--danger)' : 'var(--gray-400)' }}>
                      {change > 0 ? `+${change}` : change}
                    </td>
                    <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 12.5 }}>{l.reason ?? '—'}</td>
                    {trackingFlags.showBatch  && <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 12 }}>{l.batch_number ?? '—'}</td>}
                    {trackingFlags.showSerial && <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 12 }}>{l.serial_number ?? '—'}</td>}
                    {trackingFlags.showExpiry && <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 12 }}>{l.expiry_date ? new Date(l.expiry_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>}
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
          {/* Bug 6 fix: open in-app modal instead of browser confirm() */}
          {canCancel && (
            <button className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => setModal('cancel')} disabled={saving}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Cancel
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Bug 5 fix: edit button for draft adjustments */}
          {isDraft && (
            <button className="btn btn-outline" style={{ height: 38 }}
              onClick={() => router.push(`/products/adjustments/${adj.id}/edit`)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
          )}
          {/* Bug 6 fix: open in-app modal instead of browser confirm() */}
          {canComplete && (
            <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }}
              onClick={() => setModal('complete')} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Saving…' : 'Complete Adjustment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
