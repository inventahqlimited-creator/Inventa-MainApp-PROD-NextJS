'use client'
// src/components/app/returns-table.tsx — Sales → Returns. One row per credit note; click to open it.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Row = {
  id: string; cn_number: string; so_id: string; so_number: string | null; customer_name: string | null; return_date: string | null
  reason: string | null; status: string; total_amount: number | null; currency: string | null; location_name: string | null
}

export const cnBadge = (status: string) => {
  const s = status.toLowerCase()
  return s === 'closed' ? <span className="badge badge-closed">Closed</span>
    : s === 'cancelled' ? <span className="badge badge-cancelled">Cancelled</span>
    : <span className="badge badge-open">Open</span>
}

export default function ReturnsTable({ rows, enabled }: { rows: Row[]; enabled: boolean }) {
  const router = useRouter()
  const [status, setStatus] = useState<'all' | 'Open' | 'Closed' | 'Cancelled'>('all')
  const [q, setQ] = useState('')
  const filtered = useMemo(() => rows.filter(r =>
    (status === 'all' || r.status === status) &&
    (!q.trim() || [r.cn_number, r.so_number, r.customer_name, r.reason].some(v => String(v ?? '').toLowerCase().includes(q.trim().toLowerCase())))
  ), [rows, status, q])
  const money = (n: number | null, c: string | null) => `${c ? c + ' ' : ''}${Number(n ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Returns</div>
            <div className="page-subtitle">Credit notes for goods customers send back. Create one from a closed sales order.</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-outline" onClick={() => router.push('/sales')}>Back to Sales</button>
          </div>
        </div>
      </div>

      {!enabled && (
        <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 13 }}>
          Credit notes are switched off. Turn them on in Settings → Sales → Credit Notes to create new ones.
        </div>
      )}

      <div className="table-container">
        <div className="table-toolbar" style={{ gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search number, order, customer or reason"
            style={{ border: '1.5px solid var(--gray-200)', borderRadius: 8, padding: '6px 10px', fontSize: 13, minWidth: 260, fontFamily: 'var(--font-ui)' }} />
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
            style={{ border: '1.5px solid var(--gray-200)', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
            <option value="all">All statuses</option><option>Open</option><option>Closed</option><option>Cancelled</option>
          </select>
          <span className="table-count"><strong>{filtered.length}</strong> credit notes</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Credit note</th><th>Order</th><th>Customer</th><th>Date</th><th>Reason</th><th>Return to</th><th>Status</th><th style={{ textAlign: 'right' }}>Total</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>No credit notes yet.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/sales/returns/${r.id}`)}>
                  <td style={{ fontWeight: 600 }}>{r.cn_number}</td>
                  <td>{r.so_number ?? '—'}</td>
                  <td>{r.customer_name ?? '—'}</td>
                  <td>{r.return_date ?? '—'}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>{r.reason ?? '—'}</td>
                  <td>{r.location_name ?? '—'}</td>
                  <td>{cnBadge(r.status)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.total_amount, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
