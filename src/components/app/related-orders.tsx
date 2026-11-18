'use client'
// src/components/app/related-orders.tsx — "Related Orders" card at the bottom of a sales order, purchase order or credit note.
import { useRouter } from 'next/navigation'
import type { RelatedDoc } from '@/lib/related-docs'

const TYPE: Record<RelatedDoc['kind'], { label: string; href: (id: string) => string }> = {
  sales: { label: 'Sales Order', href: id => `/sales/${id}` },
  purchase: { label: 'Purchase Order', href: id => `/purchases/${id}` },
  return: { label: 'Credit Note', href: id => `/sales/returns/${id}` },
}

function fmtDate(d: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function badge(status: string) {
  const s = status.toLowerCase()
  const cls = ['closed', 'shipped', 'delivered', 'received'].includes(s) ? 'badge-closed'
    : s === 'cancelled' ? 'badge-cancelled'
    : s === 'draft' ? 'badge-draft' : 'badge-open'
  return <span className={`badge ${cls}`}>{status}</span>
}

export default function RelatedOrders({ items }: { items: RelatedDoc[] }) {
  const router = useRouter()
  return (
    <div className="npo-card" style={{ marginTop: 20 }}>
      <div className="npo-card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Related Orders
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '4px 0 2px' }}>No related orders.</div>
      ) : (
        <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="li-th">Type</th><th className="li-th">Number</th><th className="li-th">Relationship</th>
                <th className="li-th">Date</th><th className="li-th">Status</th><th className="li-th" style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(d => (
                <tr key={`${d.kind}-${d.id}`} onClick={() => router.push(TYPE[d.kind].href(d.id))} style={{ cursor: 'pointer' }}>
                  <td className="li-td" style={{ fontSize: 13, color: 'var(--gray-400)' }}>{TYPE[d.kind].label}</td>
                  <td className="li-td"><span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--teal)', fontSize: 13 }}>{d.number}</span></td>
                  <td className="li-td" style={{ fontSize: 13, color: 'var(--slate)' }}>{d.relation}</td>
                  <td className="li-td" style={{ fontSize: 13, color: 'var(--gray-400)' }}>{fmtDate(d.date)}</td>
                  <td className="li-td">{badge(d.status)}</td>
                  <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>
                    {d.total == null ? '—' : `${d.currency ? d.currency + ' ' : '$'}${Number(d.total).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
