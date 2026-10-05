'use client'
// src/components/app/order-history.tsx
// "Order History" popup for a sales order, purchase order or transfer: every Audit Log entry for that order,
// newest first — who created it, what changed, picked, packed, received, closed, and posted to Xero.
import { useEffect, useState } from 'react'

type Ev = { id: string; created_at: string; category: string; action: string; ref: string | null; detail: string | null; user_name: string | null }

const TONE: Record<string, [string, string]> = {
  Sales: ['#DBEAFE', '#1E40AF'], Purchases: ['#EDE9FE', '#5B21B6'], Inventory: ['#D1FAE5', '#065F46'],
  Transfers: ['#FEF3C7', '#92400E'], Xero: ['#CFFAFE', '#155E75'],
}
const FAILED = ['#FEE2E2', '#B91C1C'] as [string, string]

export default function OrderHistory({ type, id, label, onClose }: { type: 'sales' | 'purchase' | 'transfer'; id: string; label: string; onClose: () => void }) {
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/org/history?type=${type}&id=${id}`, { cache: 'no-store' })
      .then(async r => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!live) return
        if (!ok) { setError(body.error ?? 'Could not load the history.'); return }
        setEvents(body.events ?? [])
      })
      .catch(() => live && setError('Network error — please try again.'))
    return () => { live = false }
  }, [type, id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div role="dialog" aria-label="Order history" onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 16, width: 'min(680px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)' }}>Order History</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{label} · every change, newest first</div>
          </div>
          <button className="sq-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 24px 20px' }}>
          {error && <div style={{ margin: '16px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
          {!error && !events && <div style={{ padding: '28px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>Loading…</div>}
          {events && events.length === 0 && <div style={{ padding: '28px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>No history has been recorded for this order yet.</div>}
          {events?.map(e => {
            const [bg, color] = /Failed/.test(e.action) ? FAILED : TONE[e.category] ?? ['#F1F5F9', '#475569']
            const d = new Date(e.created_at)
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--gray-50)' }}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--slate)' }}>{d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>{e.action}</span>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>by <strong style={{ color: 'var(--slate)', fontWeight: 600 }}>{e.user_name ?? 'System'}</strong></span>
                  </div>
                  {e.detail && <div style={{ fontSize: 12.5, color: 'var(--gray-500)', lineHeight: 1.5, marginTop: 5, overflowWrap: 'anywhere' }}>{e.detail}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
