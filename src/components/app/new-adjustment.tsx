'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

type Location = { id: string; name: string }
type Product = {
  id: string; name: string; sku: string | null; sell_uom: string | null
  track_stock: boolean | null; type: string
  serial_tracking: boolean | null; batch_tracking: boolean | null; expiry_tracking: boolean | null
}
type StockLevel = { product_id: string; location_id: string; quantity: number }

type TrackingFlags = {
  showSerial: boolean
  showBatch: boolean
  showExpiry: boolean
}

type LineItem = {
  product_id: string
  product_name: string
  product_sku: string
  unit: string
  quantity_before: number
  quantity_after: number
  reason: string
  batch_number: string
  serial_number: string
  expiry_date: string
  // per-line product tracking flags
  needs_serial: boolean
  needs_batch: boolean
  needs_expiry: boolean
}

const REASONS = ['Stocktake', 'Damaged', 'Expired', 'Found', 'Lost', 'Theft', 'Sample', 'Write-off', 'Other']

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={onCancel}>Keep editing</button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Expiry Date Input with auto-format dd/mm/yyyy and portal calendar picker ──
function ExpiryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [displayVal, setDisplayVal] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [calPos, setCalPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) { setDisplayVal(''); return }
    const [y, m, d] = value.split('-')
    if (y && m && d) setDisplayVal(`${d}/${m}/${y}`)
    else setDisplayVal(value)
  }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowCal(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openCal = useCallback(() => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setCalPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX })
    }
    setShowCal(true)
  }, [])

  function handleType(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let fmt = ''
    if (digits.length <= 2) fmt = digits
    else if (digits.length <= 4) fmt = `${digits.slice(0,2)}/${digits.slice(2)}`
    else fmt = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
    setDisplayVal(fmt)
    if (digits.length === 8) {
      const d = digits.slice(0,2), mo = digits.slice(2,4), y = digits.slice(4,8)
      const iso = `${y}-${mo}-${d}`
      const dt = new Date(iso)
      if (!isNaN(dt.getTime())) onChange(iso)
      else onChange('')
    } else {
      onChange('')
    }
  }

  function pickDay(d: Date) {
    const iso = d.toISOString().split('T')[0]
    onChange(iso)
    setShowCal(false)
  }

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const selectedDate = value ? new Date(value + 'T00:00:00') : null

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)

  const calendar = showCal ? createPortal(
    <div style={{ position: 'absolute', top: calPos.top, left: calPos.left, zIndex: 9999, background: 'var(--white)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid var(--gray-100)', padding: 14, width: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" onClick={() => setCalMonth(new Date(year, month - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, color: 'var(--gray-400)', fontSize: 16 }}>‹</button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--slate)' }}>{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setCalMonth(new Date(year, month + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, color: 'var(--gray-400)', fontSize: 16 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const thisDate = new Date(year, month, day)
          const isSelected = selectedDate && thisDate.toDateString() === selectedDate.toDateString()
          const isToday = thisDate.toDateString() === new Date().toDateString()
          return (
            <button key={i} type="button" onClick={() => pickDay(thisDate)} style={{ background: isSelected ? 'var(--teal)' : isToday ? 'var(--teal-surface, #F0FDFA)' : 'none', color: isSelected ? 'var(--white)' : isToday ? 'var(--teal)' : 'var(--slate)', border: 'none', borderRadius: 7, cursor: 'pointer', padding: '5px 2px', fontSize: 12, fontWeight: isSelected || isToday ? 700 : 400, fontFamily: 'var(--font-ui)' }}>{day}</button>
          )
        })}
      </div>
      <div style={{ marginTop: 10, borderTop: '1px solid var(--gray-100)', paddingTop: 8, display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={() => pickDay(new Date())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--teal)', fontWeight: 600, fontFamily: 'var(--font-ui)' }}>Today</button>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'relative' }}>
        <input
          className="li-input"
          value={displayVal}
          onChange={e => handleType(e.target.value)}
          onFocus={openCal}
          placeholder="DD/MM/YYYY"
          style={{ width: 110, paddingRight: 28 }}
          maxLength={10}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => showCal ? setShowCal(false) : openCal()}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--gray-400)', display: 'flex', alignItems: 'center' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
      </div>
      {calendar}
    </div>
  )
}

export default function NewAdjustment({
  orgId,
  locations,
  products,
  stockLevels,
  trackingFlags = { showSerial: false, showBatch: false, showExpiry: false },
}: {
  orgId: string
  locations: Location[]
  products: Product[]
  stockLevels: StockLevel[]
  trackingFlags?: TrackingFlags
}) {
  const router = useRouter()
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [reasonOpen, setReasonOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<Record<number, Record<string, string>>>({})
  const [confirmComplete, setConfirmComplete] = useState(false)

  // Recompute whether tracking columns should show based on lines currently added
  const showSerial = trackingFlags.showSerial || lines.some(l => l.needs_serial)
  const showBatch  = trackingFlags.showBatch  || lines.some(l => l.needs_batch)
  const showExpiry = trackingFlags.showExpiry || lines.some(l => l.needs_expiry)

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
      batch_number: '',
      serial_number: '',
      expiry_date: '',
      needs_serial: !!p.serial_tracking,
      needs_batch: !!p.batch_tracking,
      needs_expiry: !!p.expiry_tracking,
    }])
    setItemSearch('')
    setItemDropOpen(false)
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number | boolean) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
    // Clear field-level error on change
    if (lineErrors[idx]?.[field as string]) {
      setLineErrors(prev => {
        const next = { ...prev }
        if (next[idx]) { delete next[idx][field as string]; if (!Object.keys(next[idx]).length) delete next[idx] }
        return next
      })
    }
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
    setLineErrors(prev => {
      const next: typeof prev = {}
      Object.entries(prev).forEach(([k, v]) => { const ki = parseInt(k); if (ki < idx) next[ki] = v; else if (ki > idx) next[ki - 1] = v })
      return next
    })
  }

  function validate(): boolean {
    const errs: Record<number, Record<string, string>> = {}
    lines.forEach((l, idx) => {
      const e: Record<string, string> = {}
      if (l.needs_serial) {
        if (!l.serial_number.trim()) e.serial_number = 'Serial number required'
        else if ((l.quantity_after - l.quantity_before) !== 1 && l.quantity_after !== 1) {
          // Serial = exactly 1 unit change (after must be before+1 or after must be 1 if adding)
          if (Math.abs(l.quantity_after - l.quantity_before) !== 1) {
            e.quantity_after = 'Serial tracked items must adjust by exactly 1 unit per row'
          }
        }
      }
      if (l.needs_batch && !l.batch_number.trim()) e.batch_number = 'Batch number required'
      if (l.needs_expiry && !l.expiry_date) e.expiry_date = 'Expiry date required'
      if (Object.keys(e).length) errs[idx] = e
    })
    setLineErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Also validate serial qty live when qty changes
  function handleQtyChange(idx: number, val: number) {
    updateLine(idx, 'quantity_after', val)
    const l = lines[idx]
    if (l.needs_serial && l.serial_number.trim()) {
      const change = val - l.quantity_before
      if (Math.abs(change) !== 1) {
        setLineErrors(prev => ({ ...prev, [idx]: { ...prev[idx], quantity_after: 'Serial tracked items must adjust by exactly 1 unit per row' } }))
      } else {
        setLineErrors(prev => {
          const next = { ...prev }
          if (next[idx]) { delete next[idx].quantity_after; if (!Object.keys(next[idx]).length) delete next[idx] }
          return next
        })
      }
    }
  }

  // Also validate serial when serial field filled
  function handleSerialChange(idx: number, val: string) {
    updateLine(idx, 'serial_number', val)
    const l = lines[idx]
    if (val.trim()) {
      const change = l.quantity_after - l.quantity_before
      if (Math.abs(change) !== 1) {
        setLineErrors(prev => ({ ...prev, [idx]: { ...prev[idx], quantity_after: 'Serial tracked items must adjust by exactly 1 unit per row' } }))
      }
    }
  }

  async function save(status: 'Draft' | 'Completed') {
    if (!selectedLocation) { setError('Please select a location.'); return }
    if (lines.length === 0) { setError('Add at least one product.'); return }
    if (status === 'Completed' && !validate()) { setError('Please fill in all required tracking fields before completing.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      location_id: selectedLocation.id,
      location_name: selectedLocation.name,
      status: 'Draft',
      adjustment_date: adjustmentDate,
      reason: reason || null,
      notes: notes || null,
      lines: lines.map((l, i) => ({
        product_id: l.product_id, product_name: l.product_name, product_sku: l.product_sku,
        unit: l.unit, quantity_before: l.quantity_before, quantity_after: l.quantity_after,
        reason: l.reason || null, sort_order: i,
        batch_number: l.batch_number || null,
        serial_number: l.serial_number || null,
        expiry_date: l.expiry_date || null,
      })),
    }

    const res = await fetch('/api/org/adjustments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); setSaving(false); return }

    if (status === 'Completed') {
      const patchRes = await fetch(`/api/org/adjustments/${data.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Completed' }),
      })
      const patchData = await patchRes.json()
      if (!patchRes.ok) { setError(patchData.error ?? 'Failed to complete adjustment'); setSaving(false); return }
    }

    setSaving(false)
    router.push(`/products/adjustments/${data.id}`)
  }

  const extraCols = (showBatch ? 1 : 0) + (showSerial ? 1 : 0) + (showExpiry ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {confirmComplete && (
        <ConfirmModal
          title="Complete Adjustment"
          message="This will apply the quantity changes to your stock levels. Are you sure?"
          confirmLabel="Complete Adjustment"
          onConfirm={() => { setConfirmComplete(false); save('Completed') }}
          onCancel={() => setConfirmComplete(false)}
        />
      )}

      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <button onClick={() => router.push('/products/adjustments')} className="sq-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>New Stock Adjustment</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>Adjust inventory quantities manually</div>
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
                      <div key={l.id} className={`fp-item${selectedLocation?.id === l.id ? ' active' : ''}`} onClick={() => { setSelectedLocation(l); setLocationOpen(false); setLines([]) }}>{l.name}</div>
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
                  {showBatch  && <th className="li-th" style={{ width: 120 }}>Batch / Lot</th>}
                  {showSerial && <th className="li-th" style={{ width: 120 }}>Serial #</th>}
                  {showExpiry && <th className="li-th" style={{ width: 130 }}>Expiry Date</th>}
                  <th className="li-th" style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={8 + extraCols} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      {selectedLocation ? 'Search below to add products.' : 'Select a location first.'}
                    </td>
                  </tr>
                )}
                {lines.map((l, idx) => {
                  const change = l.quantity_after - l.quantity_before
                  const errs = lineErrors[idx] ?? {}
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)', verticalAlign: 'top' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku || '—'}</span></td>
                      <td className="li-td">
                        <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span>
                        {l.needs_serial && <span style={{ display: 'block', fontSize: 10, color: 'var(--teal)', marginTop: 2, fontWeight: 600 }}>Serial tracked</span>}
                        {l.needs_batch  && <span style={{ display: 'block', fontSize: 10, color: 'var(--teal)', marginTop: 1, fontWeight: 600 }}>Batch tracked</span>}
                        {l.needs_expiry && <span style={{ display: 'block', fontSize: 10, color: 'var(--teal)', marginTop: 1, fontWeight: 600 }}>Expiry tracked</span>}
                      </td>
                      <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>{l.unit}</td>
                      <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)', fontWeight: 500 }}>{l.quantity_before}</td>
                      <td className="li-td" style={{ textAlign: 'right' }}>
                        <input className={`li-input right${errs.quantity_after ? ' li-input-error' : ''}`} type="number" step="1" value={l.quantity_after}
                          onChange={e => handleQtyChange(idx, parseFloat(e.target.value) || 0)}
                          onFocus={e => e.target.select()}
                          style={{ width: 90, textAlign: 'right' }} />
                        {errs.quantity_after && <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 2, lineHeight: 1.3 }}>{errs.quantity_after}</div>}
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
                      {showBatch && (
                        <td className="li-td">
                          {l.needs_batch ? (
                            <>
                              <input className={`li-input${errs.batch_number ? ' li-input-error' : ''}`} type="text" value={l.batch_number}
                                onChange={e => updateLine(idx, 'batch_number', e.target.value)}
                                placeholder="Batch…" style={{ width: 100 }} />
                              {errs.batch_number && <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 2 }}>{errs.batch_number}</div>}
                            </>
                          ) : <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>}
                        </td>
                      )}
                      {showSerial && (
                        <td className="li-td">
                          {l.needs_serial ? (
                            <>
                              <input className={`li-input${errs.serial_number ? ' li-input-error' : ''}`} type="text" value={l.serial_number}
                                onChange={e => handleSerialChange(idx, e.target.value)}
                                placeholder="Serial…" style={{ width: 100 }} />
                              {errs.serial_number && <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 2 }}>{errs.serial_number}</div>}
                            </>
                          ) : <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>}
                        </td>
                      )}
                      {showExpiry && (
                        <td className="li-td" style={{ overflow: 'visible' }}>
                          {l.needs_expiry ? (
                            <>
                              <ExpiryInput value={l.expiry_date} onChange={v => updateLine(idx, 'expiry_date', v)} />
                              {errs.expiry_date && <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 2 }}>{errs.expiry_date}</div>}
                            </>
                          ) : <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>}
                        </td>
                      )}
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
        <button onClick={() => router.push('/products/adjustments')} className="btn btn-outline" style={{ height: 38 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancel
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Draft')} disabled={saving}>Save Draft</button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => setConfirmComplete(true)} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Saving…' : 'Complete Adjustment'}
          </button>
        </div>
      </div>
    </div>
  )
}
