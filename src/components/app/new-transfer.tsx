'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Location = { id: string; name: string }
type Product = { id: string; name: string; sku: string | null; sell_uom: string | null; track_stock: boolean | null; type: string }
type LineItem = { product_id: string; product_name: string; product_sku: string; unit: string; quantity: number }

export default function NewTransfer({
  orgId,
  locations,
  products,
}: {
  orgId: string
  locations: Location[]
  products: Product[]
}) {
  const router = useRouter()
  const [fromLocation, setFromLocation] = useState<Location | null>(null)
  const [toLocation, setToLocation] = useState<Location | null>(null)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])
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

  function addLine(p: Product) {
    if (lines.find(l => l.product_id === p.id)) return
    setLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      unit: p.sell_uom ?? 'Each',
      quantity: 1,
    }])
    setItemSearch('')
    setItemDropOpen(false)
  }

  function updateQty(idx: number, qty: number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function save(status: 'Draft' | 'In Transit') {
    if (!fromLocation) { setError('Please select a From location.'); return }
    if (!toLocation) { setError('Please select a To location.'); return }
    if (fromLocation.id === toLocation.id) { setError('From and To locations must be different.'); return }
    if (lines.length === 0) { setError('Add at least one product.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      from_location_id: fromLocation.id,
      to_location_id: toLocation.id,
      from_location_name: fromLocation.name,
      to_location_name: toLocation.name,
      status,
      transfer_date: transferDate,
      expected_date: expectedDate || null,
      notes: notes || null,
      lines: lines.map((l, i) => ({ ...l, sort_order: i })),
    }

    const res = await fetch('/api/org/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
    router.push(`/transfers/${data.id}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/transfers')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>New Stock Transfer</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>Transfer # will be assigned on save</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={() => { setFromOpen(false); setToOpen(false); setItemDropOpen(false) }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}

        {/* Locations row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, marginBottom: 20, alignItems: 'center' }}>

          {/* From */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              From Location <span className="req">*</span>
            </div>
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button className="modal-dd-btn" onClick={() => setFromOpen(o => !o)} type="button">
                <span style={{ color: fromLocation ? 'var(--slate)' : 'var(--gray-400)' }}>{fromLocation?.name ?? 'Select location…'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {fromOpen && (
                <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                  <div className="col-dropdown-title">From Location</div>
                  {locations.map(l => (
                    <div key={l.id} className={`fp-item${fromLocation?.id === l.id ? ' active' : ''}${l.id === toLocation?.id ? ' disabled' : ''}`}
                      style={{ opacity: l.id === toLocation?.id ? 0.4 : 1 }}
                      onClick={() => { if (l.id !== toLocation?.id) { setFromLocation(l); setFromOpen(false) } }}>
                      {l.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>

          {/* To */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              To Location <span className="req">*</span>
            </div>
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button className="modal-dd-btn" onClick={() => setToOpen(o => !o)} type="button">
                <span style={{ color: toLocation ? 'var(--slate)' : 'var(--gray-400)' }}>{toLocation?.name ?? 'Select location…'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {toOpen && (
                <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                  <div className="col-dropdown-title">To Location</div>
                  {locations.map(l => (
                    <div key={l.id} className={`fp-item${toLocation?.id === l.id ? ' active' : ''}${l.id === fromLocation?.id ? ' disabled' : ''}`}
                      style={{ opacity: l.id === fromLocation?.id ? 0.4 : 1 }}
                      onClick={() => { if (l.id !== fromLocation?.id) { setToLocation(l); setToOpen(false) } }}>
                      {l.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details card */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Transfer Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="modal-field">
              <label className="modal-label">Transfer Date <span className="req">*</span></label>
              <input className="modal-input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} style={{ background: 'var(--white)' }} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Expected Arrival</label>
              <input className="modal-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={{ background: 'var(--white)' }} />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Notes</label>
              <textarea className="modal-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes about this transfer…" style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }} />
            </div>
          </div>
        </div>

        {/* Products card */}
        <div className="npo-card" style={{ overflow: 'visible' }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Products to Transfer
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th className="li-th" style={{ width: 120 }}>Item Code</th>
                  <th className="li-th">Product</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'center' }}>Unit</th>
                  <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Quantity</th>
                  <th className="li-th" style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      No products added. Search below to add.
                    </td>
                  </tr>
                )}
                {lines.map((l, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                    <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                    <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>{l.unit}</td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      <input className="li-input right" type="number" min="1" step="1" value={l.quantity}
                        onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                        style={{ width: 80, textAlign: 'right' }} />
                    </td>
                    <td className="li-td">
                      <button onClick={() => removeLine(idx)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add product search */}
          <div style={{ padding: '10px 0 2px', position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="modal-input"
              placeholder="Search by item code or name…"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              onFocus={() => setItemDropOpen(true)}
              style={{ paddingLeft: 32, background: 'var(--gray-50)', width: 300 }}
              autoComplete="off"
            />
            {itemDropOpen && filteredProducts.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 460, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 14px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Product</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>SKU</span>
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                  {filteredProducts.map(p => {
                    const already = lines.some(l => l.product_id === p.id)
                    return (
                      <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 8, opacity: already ? 0.5 : 1 }} onClick={() => !already && addLine(p)}>
                        <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <button onClick={() => router.push('/transfers')} className="btn btn-outline" style={{ height: 38 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancel
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Draft')} disabled={saving}>Save Draft</button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => save('In Transit')} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            {saving ? 'Creating…' : 'Create Transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}
