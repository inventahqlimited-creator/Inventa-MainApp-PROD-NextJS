'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type SO = {
  id: string
  so_number: string | null
  ref: string | null
  customer_id: string | null
  customer_name: string | null
  location_id: string | null
  location_name: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  shipped_date: string | null
  notes: string | null
  total_amount: number | null
  terms: string | null
  currency: string | null
}

type Line = {
  id: string
  product_id: string | null
  product_name: string | null
  product_sku: string | null
  unit: string | null
  quantity: number
  quantity_picked: number | null
  quantity_shipped: number | null
  unit_price: number
  total_price: number | null
  discount: number | null
  tax_rate: number | null
  line_notes: string | null
}

type Customer = { id: string; name: string; email: string | null; phone: string | null; terms: string | null; currency: string | null }
type Location = { id: string; name: string }

function fmtMoney(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft">{status}</span>
  if (s === 'open') return <span className="badge badge-open">{status}</span>
  if (s === 'picking') return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>{status}</span>
  if (s === 'packed') return <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>{status}</span>
  if (s === 'shipped') return <span className="badge badge-partial">{status}</span>
  if (s === 'delivered') return <span className="badge badge-closed">{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled">{status}</span>
  return <span className="badge badge-draft">{status}</span>
}

export default function ViewSalesOrder({
  so: initialSo,
  lines,
  customers,
  locations,
  orgId,
}: {
  so: SO
  lines: Line[]
  customers: Customer[]
  locations: Location[]
  orgId: string
}) {
  const router = useRouter()
  const [so, setSo] = useState(initialSo)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editCustomerId, setEditCustomerId] = useState(so.customer_id ?? '')
  const [editCustomerName, setEditCustomerName] = useState(so.customer_name ?? '')
  const [editLocationId, setEditLocationId] = useState(so.location_id ?? '')
  const [editLocationName, setEditLocationName] = useState(so.location_name ?? '')
  const [editOrderDate, setEditOrderDate] = useState(so.order_date ?? '')
  const [editExpectedDate, setEditExpectedDate] = useState(so.expected_date ?? '')
  const [editTerms, setEditTerms] = useState(so.terms ?? 'Net 30')
  const [editNotes, setEditNotes] = useState(so.notes ?? '')
  const [editRef, setEditRef] = useState(so.ref ?? '')
  const [termsOpen, setTermsOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)

  const total = lines.reduce((sum, l) => {
    return sum + l.quantity * l.unit_price * (1 - (l.discount ?? 0) / 100)
  }, 0)

  const canCancel = !['delivered', 'cancelled'].includes(so.status.toLowerCase())
  const canEdit = !['delivered', 'cancelled'].includes(so.status.toLowerCase())

  function enterEdit() {
    setEditCustomerId(so.customer_id ?? '')
    setEditCustomerName(so.customer_name ?? '')
    setEditLocationId(so.location_id ?? '')
    setEditLocationName(so.location_name ?? '')
    setEditOrderDate(so.order_date ?? '')
    setEditExpectedDate(so.expected_date ?? '')
    setEditTerms(so.terms ?? 'Net 30')
    setEditNotes(so.notes ?? '')
    setEditRef(so.ref ?? '')
    setMode('edit')
    setError(null)
  }

  async function saveEdits() {
    setSaving(true)
    setError(null)
    const payload = {
      customer_id: editCustomerId || null,
      customer_name: editCustomerName || null,
      location_id: editLocationId || null,
      location_name: editLocationName || null,
      order_date: editOrderDate || null,
      expected_date: editExpectedDate || null,
      terms: editTerms,
      notes: editNotes || null,
      ref: editRef || null,
    }
    const res = await fetch(`/api/org/sales/${so.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
    setSo(prev => ({ ...prev, ...payload }))
    setMode('view')
  }

  async function cancelOrder() {
    if (!confirm('Cancel this sales order? This cannot be undone.')) return
    const res = await fetch(`/api/org/sales/${so.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    if (res.ok) setSo(prev => ({ ...prev, status: 'Cancelled' }))
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setTermsOpen(false); setLocationOpen(false); setCustomerOpen(false) }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/sales')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>{so.so_number ?? 'Sales Order'}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>{so.customer_name} · {fmtDate(so.order_date)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusBadge(so.status)}
          {mode === 'view' && canEdit && (
            <button className="btn btn-outline" style={{ height: 36 }} onClick={enterEdit}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Order
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={() => { setTermsOpen(false); setLocationOpen(false); setCustomerOpen(false) }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}

        {/* Customer + Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Customer
            </div>
            {mode === 'view' ? (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>{so.customer_name ?? '—'}</div>
              </div>
            ) : (
              <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <input className="modal-input" placeholder="Search customers…" value={customerSearch || editCustomerName} onChange={e => { setCustomerSearch(e.target.value); setCustomerOpen(true) }} onFocus={() => setCustomerOpen(true)} style={{ background: 'var(--gray-50)' }} autoComplete="off" />
                {customerOpen && filteredCustomers.length > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', maxHeight: 200, overflowY: 'auto', zIndex: 100, padding: 6 }}>
                    {filteredCustomers.map(c => (
                      <div key={c.id} className="fp-item" onClick={() => { setEditCustomerId(c.id); setEditCustomerName(c.name); setEditTerms(c.terms ?? 'Net 30'); setCustomerSearch(''); setCustomerOpen(false) }}>
                        <div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{c.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="modal-field" style={{ marginTop: 12 }}>
              <label className="modal-label">Customer Reference #</label>
              {mode === 'view' ? (
                <div style={{ fontSize: 13, color: 'var(--slate)', padding: '4px 0', fontWeight: 500 }}>{so.ref ?? '—'}</div>
              ) : (
                <input className="modal-input" value={editRef} onChange={e => setEditRef(e.target.value)} placeholder="Customer's reference" style={{ background: 'var(--white)' }} />
              )}
            </div>
          </div>

          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Ship From
            </div>
            {mode === 'view' ? (
              <div style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{so.location_name ?? '—'}</div>
              </div>
            ) : (
              <div className="modal-field" onClick={e => e.stopPropagation()}>
                <label className="modal-label">Location</label>
                <div style={{ position: 'relative' }}>
                  <button className="modal-dd-btn" onClick={() => setLocationOpen(o => !o)} type="button" style={{ background: 'var(--white)' }}>
                    <span>{editLocationName || 'Select location…'}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {locationOpen && (
                    <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                      <div className="col-dropdown-title">Ship From</div>
                      {locations.map(l => (
                        <div key={l.id} className={`fp-item${editLocationId === l.id ? ' active' : ''}`} onClick={() => { setEditLocationId(l.id); setEditLocationName(l.name); setLocationOpen(false) }}>{l.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Details */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Order Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 4 }}>
            <div className="modal-field">
              <label className="modal-label">Order Date</label>
              {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(so.order_date)}</div> : <input className="modal-input" type="date" value={editOrderDate} onChange={e => setEditOrderDate(e.target.value)} style={{ background: 'var(--white)' }} />}
            </div>
            <div className="modal-field">
              <label className="modal-label">Expected Delivery</label>
              {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(so.expected_date)}</div> : <input className="modal-input" type="date" value={editExpectedDate} onChange={e => setEditExpectedDate(e.target.value)} style={{ background: 'var(--white)' }} />}
            </div>
            <div className="modal-field" onClick={e => e.stopPropagation()}>
              <label className="modal-label">Payment Terms</label>
              {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{so.terms ?? '—'}</div> : (
                <div style={{ position: 'relative' }}>
                  <button className="modal-dd-btn" onClick={() => setTermsOpen(o => !o)} type="button" style={{ background: 'var(--white)' }}>
                    <span>{editTerms}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {termsOpen && (
                    <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 160 }}>
                      <div className="col-dropdown-title">Payment Terms</div>
                      {['Net 7','Net 14','Net 30','Net 60','COD','Prepaid'].map(t => (
                        <div key={t} className={`fp-item${editTerms === t ? ' active' : ''}`} onClick={() => { setEditTerms(t); setTermsOpen(false) }}>{t}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 3' }}>
              <label className="modal-label">Notes</label>
              {mode === 'view' ? <div style={{ fontSize: 13, color: so.notes ? 'var(--slate)' : 'var(--gray-400)', padding: '4px 0', lineHeight: 1.5 }}>{so.notes || '—'}</div> : <textarea className="modal-input" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }} placeholder="Internal notes…" />}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="npo-card">
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Line Items
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th className="li-th" style={{ width: 120 }}>Item Code</th>
                  <th className="li-th">Product</th>
                  <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Ordered</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Picked</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Shipped</th>
                  <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Unit Price</th>
                  <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No line items.</td></tr>
                )}
                {lines.map(l => {
                  const lt = l.quantity * l.unit_price * (1 - (l.discount ?? 0) / 100)
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                      <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span></td>
                      <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{l.unit ?? '—'}</td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{l.quantity}</td>
                      <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.quantity_picked ?? 0}</td>
                      <td className="li-td" style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>{l.quantity_shipped ?? 0}</td>
                      <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{`$${l.unit_price.toFixed(2)}`}</td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{`$${lt.toFixed(2)}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--gray-100)' }}>
            <div style={{ minWidth: 240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--slate)', letterSpacing: '-0.02em', paddingTop: 6, borderTop: '2px solid var(--slate)' }}>
                <span>Total</span><span>{fmtMoney(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {mode === 'view' ? (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => router.push('/sales')} className="btn btn-outline" style={{ height: 38 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              {canCancel && (
                <button onClick={cancelOrder} className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  Cancel Order
                </button>
              )}
            </div>
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
