'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Location = { id: string; name: string }
type Product = { id: string; name: string; sku: string | null; sell_uom: string | null; track_stock: boolean | null; type: string }
type StockLevel = { product_id: string; location_id: string; quantity: number }

type LineItem = {
  product_id: string
  product_name: string
  product_sku: string
  unit: string
  quantity_before: number
  quantity_after: number
  reason: string
}

const REASONS = ['Stocktake', 'Damaged', 'Expired', 'Found', 'Lost', 'Theft', 'Sample', 'Write-off', 'Other']

export default function EditAdjustment({
  adjId,
  initialAdj,
  initialLines,
  orgId,
  locations,
  products,
  stockLevels,
}: {
  adjId: string
  initialAdj: {
    location_id: string | null
    location_name: string | null
    adjustment_date: string | null
    reason: string | null
    notes: string | null
    status: string
  }
  initialLines: {
    product_id: string | null
    product_name: string | null
    product_sku: string | null
    unit: string | null
    quantity_before: number
    quantity_after: number
    reason: string | null
  }[]
  orgId: string
  locations: Location[]
  products: Product[]
  stockLevels: StockLevel[]
}) {
  const router = useRouter()

  const initLocation = locations.find(l => l.id === initialAdj.location_id) ?? null
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(initLocation)
  const [locationOpen, setLocationOpen] = useState(false)
  const [adjustmentDate, setAdjustmentDate] = useState(initialAdj.adjustment_date ?? new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState(initialAdj.reason ?? '')
  const [reasonOpen, setReasonOpen] = useState(false)
  const [notes, setNotes] = useState(initialAdj.notes ?? '')
  const [lines, setLines] = useState<LineItem[]>(
    initialLines.map(l => ({
      product_id: l.product_id ?? '',
      product_name: l.product_name ?? '',
      product_sku: l.product_sku ?? '',
      unit: l.unit ?? 'Each',
      quantity_before: l.quantity_before,
      quantity_after: l.quantity_after,
      reason: l.reason ?? '',
    }))
  )
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(itemSearch.toLowerCase())
    ).slice(0, 20),
    [products, itemSearch]
  )

  function getStockQty(productId: string): number {
    if (!selectedLocation) return 0
    return stockLevels.find(s => s.product_id === productId && s.location_id === selectedLocation.id)?.quantity ?? 0
  }

  function addLine(p: Product) {
    if (lines.find(l => l.product_id === p.id)) return
    const qty = getStockQty(p.id)
    setLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      unit: p.sell_uom ?? 'Each',
      quantity_before: qty,
      quantity_after: qty,
      reason,
    }])
    setItemSearch('')
    setItemDropOpen(false)
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function save(status: 'Draft' | 'Completed') {
    if (!selectedLocation) { setError('Please select a location.'); return }
    if (lines.length === 0) { setError('Add at least one product.'); return }
    setSaving(true)
    setError(null)

    // PUT saves lines + header (always as Draft first to avoid double stock application)
    const putRes = await fetch(`/api/org/adjustments/${adjId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id: selectedLocation.id,
        location_name: selectedLocation.name,
        adjustment_date: adjustmentDate,
        reason: reason || null,
        notes: notes || null,
        lines: lines.map((l, i) => ({ ...l, sort_order: i })),
      }),
    })
    const putData = await putRes.json()
    if (!putRes.ok) { setError(putData.error ?? 'Failed to save'); setSaving(false); return }

    if (status === 'Completed') {
      // PATCH sets status to Completed and applies stock changes
      const patchRes = await fetch(`/api/org/adjustments/${adjId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      })
      const patchData = await patchRes.json()
      if (!patchRes.ok) { setError(patchData.error ?? 'Failed to complete adjustment'); setSaving(false); return }
    }

    setSaving(false)
    router.push(`/products/adjustments/${adjId}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <button onClick={() => router.back()} className="sq-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>Edit Stock Adjustment</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>Editing draft adjustment</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={() => { setLocationOpen(false); setReasonOpen(false); setItemDropOpen(false) }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}

        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Adjustment Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div className="modal-field" onClick={e => e.stopPropagation()}>
              <label className="modal-label">Location <span className="req">*</span></label>
              <div style={{ position: 'relative' }}>
                <button className="modal-dd-btn" onClick={() => setLocationOpen(o => !o)} type="button">
                  <span style={{ color: selectedLocation ? 'var(--slate)' : 'var(--gray-400)' }}>{selectedLocation?.name ?? 'Select location…'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {locationOpen && (
                  <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                    <div className="col-dropdown-title">Location</div>
                    {locations.map(l => (
                      <div key={l.id} className={`fp-item${selectedLocation?.id === l.id ? ' active' : ''}`} onClick={() => { setSelectedLocation(l); setLocationOpen(false) }}>{l.name}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Adjustment Date <span className="req">*</span></label>
              <input className="modal-input" type="date" value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} style={{ background: 'var(--white)' }} />
            </div>
            <div className="modal-field" onClick={e => e.stopPropagation()}>
              <label className="modal-label">Default Reason</label>
              <div style={{ position: 'relative' }}>
                <button className="modal-dd-btn" onClick={() => setReasonOpen(o => !o)} type="button">
                  <span style={{ color: reason ? 'var(--slate)' : 'var(--gray-400)' }}>{reason || 'Select reason…'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {reasonOpen && (
                  <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 180 }}>
                    <div className="col-dropdown-title">Reason</div>
                    <div className={`fp-item${!reason ? ' active' : ''}`} onClick={() => { setReason(''); setReasonOpen(false) }}>None</div>
                    {REASONS.map(r => (
                      <div key={r} className={`fp-item${reason === r ? ' active' : ''}`} onClick={() => { setReason(r); setReasonOpen(false) }}>{r}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 3' }}>
              <label className="modal-label">Notes</label>
              <textarea className="modal-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes about this adjustment…" style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }} />
            </div>
          </div>
        </div>

        <div className="npo-card" style={{ overflow: 'visible' }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Products
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th className="li-th" style={{ width: 120 }}>SKU</th>
                  <th className="li-th">Product</th>
                  <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                  <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Current Qty</th>
                  <th className="li-th" style={{ width: 110, textAlign: 'right' }}>New Qty</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Change</th>
                  <th className="li-th" style={{ width: 150 }}>Reason</th>
                  <th className="li-th" style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      {selectedLocation ? 'Search below to add products.' : 'Select a location first.'}
                    </td>
                  </tr>
                )}
                {lines.map((l, idx) => {
                  const change = l.quantity_after - l.quantity_before
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku || '—'}</span></td>
                      <td className="li-td">
                        <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span>
                      </td>
                      <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>{l.unit}</td>
                      <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)', fontWeight: 500 }}>{l.quantity_before}</td>
                      <td className="li-td" style={{ textAlign: 'right' }}>
                        <input className="li-input right" type="number" step="1" value={l.quantity_after}
                          onChange={e => updateLine(idx, 'quantity_after', parseFloat(e.target.value) || 0)}
                          onFocus={e => e.target.select()}
                          style={{ width: 90, textAlign: 'right' }} />
                      </td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 700, color: change > 0 ? '#059669' : change < 0 ? 'var(--danger)' : 'var(--gray-400)', fontSize: 13 }}>
                        {change > 0 ? `+${change}` : change}
                      </td>
                      <td className="li-td">
                        <select value={l.reason} onChange={e => updateLine(idx, 'reason', e.target.value)}
                          style={{ border: '1.5px solid var(--gray-200)', borderRadius: 7, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--gray-900)', background: 'var(--gray-50)', outline: 'none', cursor: 'pointer', width: '100%' }}>
                          <option value="">Select…</option>
                          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="li-td">
                        <button onClick={() => removeLine(idx)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selectedLocation && (
            <div style={{ padding: '10px 0 2px', position: 'relative' }} onClick={e => e.stopPropagation()}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="modal-input" placeholder="Search by item code or name to add products…" value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setItemDropOpen(true) }}
                  onFocus={() => setItemDropOpen(true)}
                  style={{ paddingLeft: 32, background: 'var(--gray-50)', width: '100%' }} autoComplete="off" />
              </div>
              {itemDropOpen && filteredProducts.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% - 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px', padding: '8px 14px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>SKU</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Product</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>On Hand</span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                    {filteredProducts.map(p => {
                      const already = lines.some(l => l.product_id === p.id)
                      const qty = getStockQty(p.id)
                      return (
                        <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px', alignItems: 'center', gap: 8, opacity: already ? 0.5 : 1 }} onClick={() => !already && addLine(p)}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                          <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: qty <= 0 ? 'var(--danger)' : 'var(--slate)', textAlign: 'right' }}>{qty}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <button onClick={() => router.back()} className="btn btn-outline" style={{ height: 38 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancel
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Draft')} disabled={saving}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => save('Completed')} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Saving…' : 'Complete Adjustment'}
          </button>
        </div>
      </div>
    </div>
  )
}
