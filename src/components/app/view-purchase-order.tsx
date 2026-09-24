'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type PO = {
  id: string
  po_number: string | null
  ref: string | null
  supplier_id: string | null
  supplier_name: string | null
  location_id: string | null
  location_name: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  received_date: string | null
  notes: string | null
  total_amount: number | null
  terms: string | null
  currency: string | null
  reference: string | null
  order_discount: number | null
  order_discount_type: string | null
  order_discount_amount: number | null
}

type CostLine = {
  id: string
  product_id: string | null
  product_name: string | null
  product_sku: string | null
  description: string | null
  amount: number
  tax_rate: number | null
}

type Line = {
  id: string
  product_id: string | null
  product_name: string | null
  product_sku: string | null
  unit: string | null
  quantity_ordered: number
  quantity_received: number | null
  unit_cost: number
  total_cost: number | null
  discount: number | null
  tax_rate: number | null
  line_notes: string | null
  batch_num: string | null
  expiry_date: string | null
}

type ReceiveLine = {
  id: string
  product_name: string | null
  product_sku: string | null
  unit: string | null
  quantity_ordered: number
  quantity_received: number
  qty_to_receive: number
  batch_num: string
  expiry_date: string
}

type Supplier = {
  id: string
  name: string
  email: string | null
  phone: string | null
  bill_street: string | null
  bill_city: string | null
  bill_country: string | null
  terms: string | null
  currency: string | null
}

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
  if (s === 'partially received') return <span className="badge badge-partial">{status}</span>
  if (s === 'closed') return <span className="badge badge-closed">{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled">{status}</span>
  return <span className="badge badge-draft">{status}</span>
}

export default function ViewPurchaseOrder({
  po: initialPo,
  lines: initialLines,
  costLines: initialCostLines = [],
  contacts,
  locations,
  orgId,
}: {
  po: PO
  lines: Line[]
  costLines?: CostLine[]
  contacts: Supplier[]
  locations: Location[]
  orgId: string
}) {
  const router = useRouter()
  const [po, setPo] = useState(initialPo)
  const [lines, setLines] = useState(initialLines)
  const [costLines] = useState<CostLine[]>(initialCostLines)
  const [mode, setMode] = useState<'view' | 'edit' | 'receive'>('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [editSupplierId, setEditSupplierId] = useState(po.supplier_id ?? '')
  const [editSupplierName, setEditSupplierName] = useState(po.supplier_name ?? '')
  const [editLocationId, setEditLocationId] = useState(po.location_id ?? '')
  const [editLocationName, setEditLocationName] = useState(po.location_name ?? '')
  const [editOrderDate, setEditOrderDate] = useState(po.order_date ?? '')
  const [editExpectedDate, setEditExpectedDate] = useState(po.expected_date ?? '')
  const [editTerms, setEditTerms] = useState(po.terms ?? 'Net 30')
  const [editNotes, setEditNotes] = useState(po.notes ?? '')
  const [editRef, setEditRef] = useState(po.ref ?? '')
  const [termsOpen, setTermsOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')

  // Receive state
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([])
  const [receiveNotes, setReceiveNotes] = useState('')

  const subtotal = lines.reduce((sum, l) => sum + l.quantity_ordered * l.unit_cost * (1 - (l.discount ?? 0) / 100), 0)
  const additionalCostsTotal = costLines.reduce((sum, l) => sum + l.amount, 0)
  const preDiscountTotal = subtotal + additionalCostsTotal
  const orderDiscountAmount = po.order_discount_amount ?? 0
  const discountedBase = preDiscountTotal - orderDiscountAmount
  const gstTotal = lines.reduce((sum, l) => {
    const lt = l.quantity_ordered * l.unit_cost * (1 - (l.discount ?? 0) / 100)
    const factor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
    return sum + lt * factor * ((l.tax_rate ?? 0) / 100)
  }, 0) + costLines.reduce((sum, l) => {
    const factor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
    return sum + l.amount * factor * ((l.tax_rate ?? 0) / 100)
  }, 0)
  const total = discountedBase + gstTotal

  const canReceive = ['open', 'partially received'].includes(po.status.toLowerCase())
  const canCancel = !['closed', 'cancelled'].includes(po.status.toLowerCase())
  const canEdit = !['closed', 'cancelled'].includes(po.status.toLowerCase())

  function enterReceive() {
    setReceiveLines(lines.map(l => ({
      id: l.id,
      product_name: l.product_name,
      product_sku: l.product_sku,
      unit: l.unit,
      quantity_ordered: l.quantity_ordered,
      quantity_received: l.quantity_received ?? 0,
      qty_to_receive: Math.max(0, l.quantity_ordered - (l.quantity_received ?? 0)),
      batch_num: l.batch_num ?? '',
      expiry_date: l.expiry_date ?? '',
    })))
    setReceiveNotes('')
    setError(null)
    setMode('receive')
  }

  function updateReceiveLine(idx: number, field: keyof ReceiveLine, value: string | number) {
    setReceiveLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  async function submitReceive() {
    const totalToReceive = receiveLines.reduce((sum, l) => sum + Number(l.qty_to_receive), 0)
    if (totalToReceive <= 0) { setError('Enter a quantity to receive for at least one line.'); return }
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/org/purchases/${po.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: receiveLines.map(l => ({
          id: l.id,
          qty_to_receive: Number(l.qty_to_receive),
          batch_num: l.batch_num || null,
          expiry_date: l.expiry_date || null,
          new_quantity_received: l.quantity_received + Number(l.qty_to_receive),
        })),
        notes: receiveNotes || null,
      }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }

    // Update local state
    const updatedLines = lines.map(l => {
      const rl = receiveLines.find(r => r.id === l.id)
      if (!rl) return l
      return { ...l, quantity_received: l.quantity_received ?? 0 + Number(rl.qty_to_receive), batch_num: rl.batch_num || l.batch_num, expiry_date: rl.expiry_date || l.expiry_date }
    })
    setLines(updatedLines)
    setPo(prev => ({ ...prev, status: data.new_status }))
    setMode('view')
  }

  function enterEdit() {
    setEditSupplierId(po.supplier_id ?? '')
    setEditSupplierName(po.supplier_name ?? '')
    setEditLocationId(po.location_id ?? '')
    setEditLocationName(po.location_name ?? '')
    setEditOrderDate(po.order_date ?? '')
    setEditExpectedDate(po.expected_date ?? '')
    setEditTerms(po.terms ?? 'Net 30')
    setEditNotes(po.notes ?? '')
    setEditRef(po.ref ?? '')
    setMode('edit')
    setError(null)
  }

  async function saveEdits() {
    setSaving(true)
    setError(null)
    const payload = {
      supplier_id: editSupplierId || null,
      supplier_name: editSupplierName || null,
      location_id: editLocationId || null,
      location_name: editLocationName || null,
      order_date: editOrderDate || null,
      expected_date: editExpectedDate || null,
      terms: editTerms,
      notes: editNotes || null,
      ref: editRef || null,
    }
    const res = await fetch(`/api/org/purchases/${po.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
    setPo(prev => ({ ...prev, ...payload }))
    setMode('view')
  }

  async function cancelOrder() {
    if (!confirm('Cancel this purchase order? This cannot be undone.')) return
    const res = await fetch(`/api/org/purchases/${po.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    if (res.ok) setPo(prev => ({ ...prev, status: 'Cancelled' }))
  }

  const filteredSuppliers = contacts.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setTermsOpen(false); setLocationOpen(false); setSupplierOpen(false) }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => mode !== 'view' ? setMode('view') : router.push('/purchases')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>
              {mode === 'receive' ? `Receive Stock — ${po.po_number ?? 'Purchase Order'}` : po.po_number ?? 'Purchase Order'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              {po.supplier_name} · {fmtDate(po.order_date)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusBadge(po.status)}
          {mode === 'view' && canEdit && (
            <button className="btn btn-outline" style={{ height: 36 }} onClick={enterEdit}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Order
            </button>
          )}
        </div>
      </div>

      {/* ── RECEIVE MODE ── */}
      {mode === 'receive' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>
            {error && <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>}

            {/* Info banner */}
            <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div style={{ fontSize: 13, color: 'var(--teal)' }}>
                <strong>Receiving into:</strong> {po.location_name ?? '—'} &nbsp;·&nbsp; <strong>PO:</strong> {po.po_number ?? '—'}
              </div>
            </div>

            {/* Receive lines table */}
            <div className="npo-card" style={{ overflow: 'visible', marginBottom: 20 }}>
              <div className="npo-card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Enter Quantities Received
              </div>
              <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      <th className="li-th" style={{ width: 120 }}>SKU</th>
                      <th className="li-th">Product</th>
                      <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Ordered</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Already Rcvd</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Remaining</th>
                      <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Receive Now <span style={{ color: 'var(--teal)' }}>*</span></th>
                      <th className="li-th" style={{ width: 130 }}>Batch #</th>
                      <th className="li-th" style={{ width: 120 }}>Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveLines.map((l, idx) => {
                      const remaining = l.quantity_ordered - l.quantity_received
                      const isFullyReceived = remaining <= 0
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)', opacity: isFullyReceived ? 0.5 : 1 }}>
                          <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                          <td className="li-td">
                            <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span>
                            {isFullyReceived && <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Fully received</div>}
                          </td>
                          <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>{l.unit ?? '—'}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.quantity_ordered}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>{l.quantity_received}</td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : '#059669' }}>{remaining}</td>
                          <td className="li-td" style={{ textAlign: 'right' }}>
                            <input
                              className="li-input right"
                              type="number"
                              min="0"
                              max={remaining}
                              value={l.qty_to_receive}
                              disabled={isFullyReceived}
                              onChange={e => updateReceiveLine(idx, 'qty_to_receive', parseFloat(e.target.value) || 0)}
                              style={{ width: 90, textAlign: 'right', background: isFullyReceived ? 'var(--gray-50)' : undefined }}
                            />
                          </td>
                          <td className="li-td">
                            <input
                              className="li-input"
                              value={l.batch_num}
                              disabled={isFullyReceived}
                              onChange={e => updateReceiveLine(idx, 'batch_num', e.target.value)}
                              placeholder={po.po_number ?? 'Batch #'}
                              style={{ width: '100%' }}
                            />
                          </td>
                          <td className="li-td">
                            <input
                              type="date"
                              className="li-input"
                              value={l.expiry_date}
                              disabled={isFullyReceived}
                              onChange={e => updateReceiveLine(idx, 'expiry_date', e.target.value)}
                              style={{ width: '100%' }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="npo-card">
              <div className="npo-card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Receiving Notes
              </div>
              <div style={{ padding: '4px 0 8px' }}>
                <textarea
                  className="modal-input"
                  value={receiveNotes}
                  onChange={e => setReceiveNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes about this receipt…"
                  style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }}
                />
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            <button onClick={() => setMode('view')} className="btn btn-outline" style={{ height: 38 }}>Cancel</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                Receiving <strong style={{ color: 'var(--slate)' }}>{receiveLines.reduce((s, l) => s + Number(l.qty_to_receive), 0)}</strong> units into <strong style={{ color: 'var(--slate)' }}>{po.location_name}</strong>
              </div>
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={submitReceive} disabled={saving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {saving ? 'Receiving…' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── VIEW / EDIT MODE ── */}
      {mode !== 'receive' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={() => { setTermsOpen(false); setLocationOpen(false); setSupplierOpen(false) }}>

            {error && <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>}

            {/* Supplier + Location */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>
              <div className="npo-card">
                <div className="npo-card-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Supplier
                </div>
                {mode === 'view' ? (
                  <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>{po.supplier_name ?? '—'}</div>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <input className="modal-input" placeholder="Search suppliers…" value={supplierSearch || editSupplierName}
                      onChange={e => { setSupplierSearch(e.target.value); setSupplierOpen(true) }}
                      onFocus={() => setSupplierOpen(true)} style={{ background: 'var(--gray-50)' }} autoComplete="off" />
                    {supplierOpen && filteredSuppliers.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', maxHeight: 200, overflowY: 'auto', zIndex: 100, padding: 6 }}>
                        {filteredSuppliers.map(s => (
                          <div key={s.id} className="fp-item" onClick={() => { setEditSupplierId(s.id); setEditSupplierName(s.name); setEditTerms(s.terms ?? 'Net 30'); setSupplierSearch(''); setSupplierOpen(false) }}>
                            <div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{s.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="modal-field" style={{ marginTop: 12 }}>
                  <label className="modal-label">Supplier Order #</label>
                  {mode === 'view'
                    ? <div style={{ fontSize: 13, color: 'var(--slate)', padding: '4px 0', fontWeight: 500 }}>{po.ref ?? '—'}</div>
                    : <input className="modal-input" value={editRef} onChange={e => setEditRef(e.target.value)} style={{ background: 'var(--white)' }} />}
                </div>
              </div>

              <div className="npo-card">
                <div className="npo-card-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Deliver To
                </div>
                {mode === 'view' ? (
                  <div style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{po.location_name ?? '—'}</div>
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
                          <div className="col-dropdown-title">Deliver To</div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, padding: '4px 0' }}>
                <div className="modal-field">
                  <label className="modal-label">Order Date</label>
                  {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(po.order_date)}</div>
                    : <input className="modal-input" type="date" value={editOrderDate} onChange={e => setEditOrderDate(e.target.value)} style={{ background: 'var(--white)' }} />}
                </div>
                <div className="modal-field">
                  <label className="modal-label">Expected Delivery</label>
                  {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: po.expected_date && new Date(po.expected_date) < new Date() && !['closed','cancelled'].includes(po.status.toLowerCase()) ? 'var(--danger)' : 'var(--slate)', padding: '4px 0' }}>{fmtDate(po.expected_date)}</div>
                    : <input className="modal-input" type="date" value={editExpectedDate} onChange={e => setEditExpectedDate(e.target.value)} style={{ background: 'var(--white)' }} />}
                </div>
                <div className="modal-field" onClick={e => e.stopPropagation()}>
                  <label className="modal-label">Payment Terms</label>
                  {mode === 'view' ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{po.terms ?? '—'}</div> : (
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
                  {mode === 'view' ? <div style={{ fontSize: 13, color: po.notes ? 'var(--slate)' : 'var(--gray-400)', padding: '4px 0', lineHeight: 1.5 }}>{po.notes || '—'}</div>
                    : <textarea className="modal-input" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }} />}
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="npo-card">
              <div className="npo-card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                Line Items
              </div>
              <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      <th className="li-th" style={{ width: 120 }}>SKU</th>
                      <th className="li-th">Product Name</th>
                      <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Ordered</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Received</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Remaining</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Cost Price</th>
                      <th className="li-th" style={{ width: 70, textAlign: 'right' }}>Disc %</th>
                      <th className="li-th" style={{ width: 60, textAlign: 'right' }}>Tax</th>
                      <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && (
                      <tr><td colSpan={10} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No line items.</td></tr>
                    )}
                    {lines.map(l => {
                      const received = l.quantity_received ?? 0
                      const remaining = l.quantity_ordered - received
                      const lt = l.quantity_ordered * l.unit_cost * (1 - (l.discount ?? 0) / 100)
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                          <td className="li-td">
                            <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span>
                            {l.batch_num && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>Batch: {l.batch_num}</div>}
                          </td>
                          <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{l.unit ?? '—'}</td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{l.quantity_ordered}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>{received}</td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : '#059669' }}>{remaining}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{`$${l.unit_cost.toFixed(2)}`}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.discount ? `${l.discount}%` : '—'}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.tax_rate ? `${l.tax_rate}%` : '—'}</td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{`$${lt.toFixed(2)}`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Additional Costs */}
              {costLines.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--gray-200)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>Additional Costs</span>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Freight, packing and other service charges</span>
                  </div>
                  <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                      <thead>
                        <tr style={{ background: 'var(--gray-50)' }}>
                          <th className="li-th" style={{ width: 120 }}>SKU</th>
                          <th className="li-th">Name</th>
                          <th className="li-th">Description</th>
                          <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Amount</th>
                          <th className="li-th" style={{ width: 60, textAlign: 'right' }}>Tax</th>
                          <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costLines.map(l => (
                          <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                            <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span></td>
                            <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 13 }}>{l.description || '—'}</td>
                            <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{`$${l.amount.toFixed(2)}`}</td>
                            <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.tax_rate ? `${l.tax_rate}%` : '—'}</td>
                            <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{`$${(l.amount * (1 + (l.tax_rate ?? 0) / 100)).toFixed(2)}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--gray-100)' }}>
                <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                    <span>Subtotal</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(subtotal)}</span>
                  </div>
                  {additionalCostsTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                      <span>Additional Costs</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(additionalCostsTotal)}</span>
                    </div>
                  )}
                  {orderDiscountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                      <span>Order Discount {po.order_discount_type === '%' ? `(${po.order_discount}%)` : ''}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--danger)' }}>−{fmtMoney(orderDiscountAmount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                    <span>Tax</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(gstTotal)}</span>
                  </div>
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
                  <button onClick={() => router.push('/purchases')} className="btn btn-outline" style={{ height: 38 }}>
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
                {canReceive && (
                  <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={enterReceive}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Receive Order
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
        </>
      )}
    </div>
  )
}
