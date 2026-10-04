'use client'

// src/components/app/transfer-form.tsx
// New / view / edit a stock transfer. Flow: Draft → Open → Picking → Picked → Closed (or Cancelled).
// Same layout and behaviour as the Sales order form.

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import NumInput from './num-input'
import { toast } from '@/components/app/toast'

type Loc = { id: string; name: string; address?: string | null; city?: string | null; country?: string | null; phone?: string | null; email?: string | null }
type Product = { id: string; name: string; sku: string | null; sell_uom: string | null; track_stock: boolean | null; type: string | null }
type StockLevel = { product_id: string; location_id: string; quantity: number; committed: number | null }
type Bin = { id: string; name: string; location_id: string }
type Transfer = {
  id: string; tr_number: string | null; status: string
  from_location_id: string | null; to_location_id: string | null
  from_location_name: string | null; to_location_name: string | null
  transfer_date: string | null; expected_date: string | null; notes: string | null
}
type DbLine = {
  id: string; product_id: string | null; product_name: string | null; product_sku: string | null; unit: string | null
  quantity: number; quantity_picked: number | null; from_bin_id: string | null; to_bin_id: string | null; sort_order: number | null
}
type Line = {
  key: string; id?: string; product_id: string; product_name: string; product_sku: string; unit: string
  quantity: number; quantity_picked: number; from_bin_id: string; to_bin_id: string
}

const PICK_COLS = '110px minmax(160px, 1fr) 70px 90px 90px'
const today = () => new Date().toISOString().slice(0, 10)
let seq = 0
const newKey = () => `n${++seq}`

function displayStatus(status: string) {
  const s = (status ?? '').toLowerCase()
  if (s === 'open' || s === 'in transit') return 'Open'
  if (s === 'picking') return 'Picking'
  if (s === 'picked') return 'Picked'
  if (s === 'closed' || s === 'completed') return 'Closed'
  if (s === 'cancelled') return 'Cancelled'
  return 'Draft'
}

function ConfirmModal({ title, message, confirmLabel, cancelLabel = 'Go back', onConfirm, onCancel, danger, busy }: {
  title: string; message: string; confirmLabel: string; cancelLabel?: string
  onConfirm: () => void; onCancel: () => void; danger?: boolean; busy?: boolean
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onCancel}>
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', background: danger ? 'var(--danger)' : undefined, borderColor: danger ? 'var(--danger)' : undefined }} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

const closeX = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

// A location card: dropdown until chosen, then expands to name / phone / email / address
function LocationCard({ title, locations, value, onPick, onClear, editable, canClear, open, setOpen }: {
  title: string; locations: Loc[]; value: Loc | null
  onPick: (l: Loc) => void; onClear: () => void
  editable: boolean; canClear: boolean; open: boolean; setOpen: (o: boolean) => void
}) {
  return (
    <div className="npo-card">
      <div className="npo-card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        {title}
      </div>
      {!value ? (
        <div className="modal-field" data-dropdown onClick={e => e.stopPropagation()}>
          <label className="modal-label">Location <span className="req">*</span></label>
          <div style={{ position: 'relative' }}>
            <button className="modal-dd-btn" type="button" disabled={!editable} onClick={() => setOpen(!open)} style={{ background: 'var(--white)' }}>
              <span style={{ color: 'var(--gray-400)' }}>Select location…</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {open && (
              <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                <div className="col-dropdown-title">{title}</div>
                {locations.map(l => <div key={l.id} className="fp-item" onClick={() => { onPick(l); setOpen(false) }}>{l.name}</div>)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{value.name}</div>
              {value.phone && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{value.phone}</div>}
              {value.email && <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 2 }}>{value.email}</div>}
              {(value.address || value.city) && (
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{[value.address, value.city, value.country].filter(Boolean).join(', ')}</div>
              )}
            </div>
            {editable && canClear && (
              <button onClick={onClear} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>{closeX}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TransferForm({ transfer, lines: dbLines, locations, products, stockLevels, bins, defaultFromId }: {
  orgId: string
  transfer: Transfer | null
  lines: DbLine[]
  locations: Loc[]
  products: Product[]
  stockLevels: StockLevel[]
  bins: Bin[]
  defaultFromId: string | null
}) {
  const router = useRouter()
  const isNew = !transfer
  const scrollRef = useRef<HTMLDivElement>(null)

  const toLines = (ls: DbLine[]): Line[] => [...ls].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(l => ({
    key: l.id, id: l.id, product_id: l.product_id ?? '', product_name: l.product_name ?? '', product_sku: l.product_sku ?? '',
    unit: l.unit ?? 'Each', quantity: Number(l.quantity), quantity_picked: Number(l.quantity_picked ?? 0),
    from_bin_id: l.from_bin_id ?? '', to_bin_id: l.to_bin_id ?? '',
  }))

  const [mode, setMode] = useState<'view' | 'edit'>(isNew ? 'edit' : 'view')
  const [fromId, setFromId] = useState<string | null>(transfer?.from_location_id ?? (isNew ? defaultFromId : null))
  const [toId, setToId] = useState<string | null>(transfer?.to_location_id ?? null)
  const [transferDate, setTransferDate] = useState((transfer?.transfer_date ?? today()).slice(0, 10))
  const [expectedDate, setExpectedDate] = useState((transfer?.expected_date ?? '').slice(0, 10))
  const [notes, setNotes] = useState(transfer?.notes ?? '')
  const [lines, setLines] = useState<Line[]>(() => toLines(dbLines))
  const [openDd, setOpenDd] = useState<string | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setErrorRaw] = useState<string | null>(null)
  const setError = (m: string | null) => { setErrorRaw(m); if (m) toast.error(m) }
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  // Re-sync after the server refreshes the page (save, pick, complete…)
  useEffect(() => {
    if (!transfer) return
    setFromId(transfer.from_location_id); setToId(transfer.to_location_id)
    setTransferDate((transfer.transfer_date ?? today()).slice(0, 10)); setExpectedDate((transfer.expected_date ?? '').slice(0, 10))
    setNotes(transfer.notes ?? ''); setLines(toLines(dbLines)); setMode('view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer, dbLines])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-dropdown]')) { setOpenDd(null); setItemDropOpen(false) }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (error) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }, [error])

  const status = displayStatus(transfer?.status ?? 'Draft')
  const isDraft = isNew || status === 'Draft'
  const statusEditable = isNew || ['Draft', 'Open', 'Picking', 'Picked'].includes(status)
  const editable = mode === 'edit' && statusEditable
  const anyPicked = lines.some(l => l.quantity_picked > 0)
  const fulfilling = status === 'Picking' || status === 'Picked'

  const fromLoc = locations.find(l => l.id === fromId) ?? null
  const toLoc = locations.find(l => l.id === toId) ?? null
  const fromBins = useMemo(() => bins.filter(b => b.location_id === fromId), [bins, fromId])
  const toBins = useMemo(() => bins.filter(b => b.location_id === toId), [bins, toId])
  const showFromBin = fromBins.length > 0
  const showToBin = toBins.length > 0

  const onHand = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of stockLevels) if (s.location_id === fromId) m[s.product_id] = (m[s.product_id] ?? 0) + Number(s.quantity || 0)
    return m
  }, [stockLevels, fromId])

  // Stocked items only (never services / non-stock)
  const filteredProducts = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    return products
      .filter(p => p.track_stock !== false && p.type === 'Stock')
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [products, itemSearch])

  function addLine(p: Product) {
    setLines(ls => [...ls, { key: newKey(), product_id: p.id, product_name: p.name, product_sku: p.sku ?? '', unit: p.sell_uom ?? 'Each', quantity: 1, quantity_picked: 0, from_bin_id: '', to_bin_id: '' }])
    setItemSearch(''); setItemDropOpen(false)
  }
  function updateLine(key: string, patch: Partial<Line>) { setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))) }
  function removeLine(key: string) { setLines(ls => ls.filter(l => l.key !== key)) }

  function pickFrom(l: Loc) { setFromId(l.id); setLines(ls => ls.map(x => ({ ...x, from_bin_id: '' }))) }
  function pickTo(l: Loc) { setToId(l.id); setLines(ls => ls.map(x => ({ ...x, to_bin_id: '' }))) }

  function validate(): string | null {
    if (!fromId) return 'Choose a From location.'
    if (!toId) return 'Choose a To location.'
    if (lines.length === 0) return 'Add at least one product.'
    if (lines.some(l => !(l.quantity > 0))) return 'Every line needs a quantity above zero.'
    if (fromId === toId) {
      if (!showFromBin) return 'To move stock within one location, that location needs bins. Choose a different To location, or add bins first.'
      for (const l of lines) {
        if (!l.from_bin_id || !l.to_bin_id) return `${l.product_name}: choose both a From Bin and a To Bin when moving within one location.`
        if (l.from_bin_id === l.to_bin_id) return `${l.product_name}: From Bin and To Bin must be different.`
      }
    }
    return null
  }

  async function save(status?: 'Draft' | 'Open') {
    setError(null)
    const bad = validate()
    if (bad) { setError(bad); return }
    setSaving(true)
    const body = {
      from_location_id: fromId, to_location_id: toId,
      from_location_name: fromLoc?.name ?? null, to_location_name: toLoc?.name ?? null,
      transfer_date: transferDate || null, expected_date: expectedDate || null, notes: notes || null,
      ...(status ? { status } : {}),
      lines: lines.map(l => ({
        ...(l.id ? { id: l.id } : {}),
        product_id: l.product_id, product_name: l.product_name, product_sku: l.product_sku, unit: l.unit,
        quantity: l.quantity, from_bin_id: l.from_bin_id || null, to_bin_id: l.to_bin_id || null,
      })),
    }
    try {
      const res = await fetch(isNew ? '/api/org/transfers' : `/api/org/transfers/${transfer!.id}`, {
        method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not save this transfer.'); return }
      if (isNew) { toast.later('success', 'Transfer created'); router.push(`/transfers/${data.id}`); router.refresh(); return }
      toast.success('Transfer saved')
      setMode('view')
      router.refresh()
    } catch { setError('Network error — please try again.') }
    finally { setSaving(false) }
  }

  async function act(url: string, init: RequestInit, fail: string, done?: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? fail); return false }
      if (done) toast.success(done)
      router.refresh()
      return true
    } catch { setError('Network error — please try again.'); return false }
    finally { setBusy(false) }
  }
  async function cancelTransfer() {
    const ok = await act(`/api/org/transfers/${transfer!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Cancelled' }) }, 'Could not cancel this transfer.', 'Transfer cancelled')
    setConfirmCancel(false)
    if (ok) setMode('view')
  }
  async function completeTransfer() {
    await act(`/api/org/transfers/${transfer!.id}/complete`, { method: 'POST' }, 'Could not complete this transfer.', 'Transfer completed')
    setConfirmComplete(false)
  }

  const onDiscard = () => {
    if (!transfer) return
    setFromId(transfer.from_location_id); setToId(transfer.to_location_id)
    setTransferDate((transfer.transfer_date ?? today()).slice(0, 10)); setExpectedDate((transfer.expected_date ?? '').slice(0, 10))
    setNotes(transfer.notes ?? ''); setLines(toLines(dbLines)); setError(null); setMode('view')
  }

  const thStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }
  const dis = { background: editable ? 'var(--white)' : 'var(--gray-50)' }
  const binSelect = (value: string, options: Bin[], onChange: (v: string) => void, disabled: boolean) => (
    <select className="li-input" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} style={{ width: '100%', minWidth: 120, background: disabled ? 'var(--gray-50)' : undefined }}>
      <option value="">{options.length ? 'Default' : '—'}</option>
      {options.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  )
  const binLabel = (id: string, list: Bin[]) => list.find(b => b.id === id)?.name ?? 'Default'
  const showPickedCol = !isNew && (fulfilling || anyPicked)

  const statusStyle: React.CSSProperties | undefined =
    status === 'Picking' ? { background: '#EDE9FE', color: '#5B21B6' } : status === 'Picked' ? { background: '#DBEAFE', color: '#1D4ED8' } : undefined
  const statusClass = status === 'Closed' ? 'badge-closed' : status === 'Cancelled' ? 'badge-cancelled' : status === 'Draft' ? 'badge-draft' : 'badge-open'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/transfers')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>
              {isNew ? 'New Transfer' : transfer!.tr_number ?? 'Transfer'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              {isNew ? 'Transfer # will be assigned on save' : `${fromLoc?.name ?? '—'} → ${toLoc?.name ?? '—'}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isNew && mode === 'edit' && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Editing</span>}
          {isNew
            ? <><span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Draft</span><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} /></>
            : <span className={`badge ${statusClass}`} style={statusStyle}>{status}</span>}
          {!isNew && mode === 'view' && statusEditable && (
            <button className="btn btn-outline" style={{ height: 34, marginLeft: 4 }} onClick={() => { setError(null); setMode('edit') }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Edit
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>
        {error && <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>}
        {!isNew && !statusEditable && (
          <div style={{ background: '#F8FAFC', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>
            This transfer is <strong style={{ color: 'var(--slate)' }}>{status}</strong> and cannot be edited.
          </div>
        )}

        {/* From / To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>
          <LocationCard title="From Location" locations={locations} value={fromLoc} onPick={pickFrom} onClear={() => setFromId(null)} editable={editable} canClear={!anyPicked} open={openDd === 'from'} setOpen={o => setOpenDd(o ? 'from' : null)} />
          <LocationCard title="To Location" locations={locations} value={toLoc} onPick={pickTo} onClear={() => setToId(null)} editable={editable} canClear open={openDd === 'to'} setOpen={o => setOpenDd(o ? 'to' : null)} />
        </div>

        {/* Details */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Transfer Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 4 }}>
            <div className="modal-field">
              <label className="modal-label">Transfer Date <span className="req">*</span></label>
              <input className="modal-input" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} disabled={!editable} style={dis} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Expected Date</label>
              <input className="modal-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} disabled={!editable} style={dis} />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Notes</label>
              <textarea className="modal-input" value={notes} onChange={e => setNotes(e.target.value)} disabled={!editable} rows={2} placeholder="Notes or instructions for this transfer…" style={{ resize: 'vertical', height: 60, lineHeight: 1.5, ...dis }} />
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="npo-card" style={{ overflow: 'visible' }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            Products to Transfer
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th className="li-th" style={{ width: 120 }}>SKU</th>
                  <th className="li-th">Product Name</th>
                  <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                  <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Qty</th>
                  {showPickedCol && <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Picked</th>}
                  {showFromBin && <th className="li-th" style={{ width: 160 }}>From Bin</th>}
                  {showToBin && <th className="li-th" style={{ width: 160 }}>To Bin</th>}
                  {editable && <th className="li-th" style={{ width: 36 }} />}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td className="li-td" colSpan={9} style={{ textAlign: 'center', padding: '28px 0', color: 'var(--gray-400)', fontSize: 13 }}>No products yet — search below to add stocked items.</td></tr>
                )}
                {lines.map(l => {
                  const fullyPicked = l.quantity_picked > 0 && l.quantity_picked >= l.quantity
                  const lockQty = !editable || fullyPicked
                  const lockFrom = !editable || l.quantity_picked > 0
                  return (
                    <tr key={l.key} style={{ borderBottom: '1px solid var(--gray-50)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                      <td className="li-td">
                        <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span>
                        {editable && fromId && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>On hand at {fromLoc?.name}: {onHand[l.product_id] ?? 0}</div>}
                      </td>
                      <td className="li-td" style={{ textAlign: 'center', fontSize: 12, color: 'var(--gray-400)' }}>{l.unit}</td>
                      <td className="li-td" style={{ textAlign: 'right' }}>
                        {lockQty
                          ? <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.quantity}</span>
                          : <NumInput className="li-input right" value={l.quantity} onChange={n => updateLine(l.key, { quantity: Math.max(n, l.quantity_picked) })} min={Math.max(l.quantity_picked, 0)} style={{ width: 80, textAlign: 'right' }} />}
                      </td>
                      {showPickedCol && <td className="li-td" style={{ textAlign: 'right', fontSize: 13, color: l.quantity_picked >= l.quantity ? '#065F46' : 'var(--gray-400)', fontWeight: 600 }}>{l.quantity_picked}</td>}
                      {showFromBin && (
                        <td className="li-td">
                          {lockFrom ? <span style={{ fontSize: 13, color: 'var(--gray-500, var(--gray-400))' }}>{binLabel(l.from_bin_id, fromBins)}</span> : binSelect(l.from_bin_id, fromBins, v => updateLine(l.key, { from_bin_id: v }), false)}
                        </td>
                      )}
                      {showToBin && (
                        <td className="li-td">
                          {!editable ? <span style={{ fontSize: 13, color: 'var(--gray-500, var(--gray-400))' }}>{binLabel(l.to_bin_id, toBins)}</span> : binSelect(l.to_bin_id, toBins, v => updateLine(l.key, { to_bin_id: v }), false)}
                        </td>
                      )}
                      {editable && (
                        <td className="li-td">
                          {l.quantity_picked > 0 ? null : (
                            <button onClick={() => removeLine(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)' }} title="Remove">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {editable && (
            <div style={{ padding: '10px 0 2px', position: 'relative' }} data-dropdown onClick={e => e.stopPropagation()}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="modal-input" placeholder="Search by SKU or name to add products…" value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setItemDropOpen(true) }} onFocus={() => setItemDropOpen(true)}
                  style={{ paddingLeft: 32, background: 'var(--gray-50)', width: '100%' }} autoComplete="off" />
              </div>
              {itemDropOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% - 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                  {filteredProducts.length > 0 ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: PICK_COLS, gap: 8, padding: '8px 20px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                        <span style={thStyle}>SKU</span>
                        <span style={thStyle}>Product</span>
                        <span style={{ ...thStyle, textAlign: 'center' }}>Unit</span>
                        <span style={{ ...thStyle, textAlign: 'right' }} title={fromLoc ? `At ${fromLoc.name}` : 'Choose a From location'}>On Hand</span>
                        <span style={{ ...thStyle, textAlign: 'right' }}>Committed</span>
                      </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                        {filteredProducts.map(p => {
                          const oh = onHand[p.id] ?? 0
                          const committed = stockLevels.filter(s => s.location_id === fromId && s.product_id === p.id).reduce((t, s) => t + Number(s.committed ?? 0), 0)
                          return (
                            <div key={p.id} className="fp-item" style={{ display: 'grid', gridTemplateColumns: PICK_COLS, alignItems: 'center', gap: 8 }} onClick={() => addLine(p)}>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                              <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                              <span style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center' }}>{p.sell_uom ?? 'Each'}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: !fromId ? 'var(--gray-400)' : oh <= 0 ? 'var(--danger)' : '#059669' }}>{fromId ? oh : '—'}</span>
                              <span style={{ fontSize: 13, textAlign: 'right', color: 'var(--gray-400)' }}>{fromId ? committed : '—'}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--gray-400)' }}>{itemSearch ? `No stocked products matching "${itemSearch}"` : 'No stocked products available'}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {mode === 'edit' ? (
          <button onClick={() => setConfirmLeave(true)} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </button>
        ) : (
          <button onClick={() => router.push('/transfers')} className="btn btn-outline" style={{ height: 38 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Transfers
          </button>
        )}

        {!isNew && mode === 'view' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusEditable && (
              <button className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: '#FECACA' }} onClick={() => setConfirmCancel(true)}>Cancel Transfer</button>
            )}
            {status === 'Draft' && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
                {saving ? 'Submitting…' : 'Submit Transfer'}
              </button>
            )}
            {(status === 'Open' || status === 'Picking') && (
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => router.push(`/transfers/${transfer!.id}/pick`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><polyline points="3 8 12 13 21 8"/><line x1="12" y1="13" x2="12" y2="22"/></svg>
                {status === 'Picking' && anyPicked ? 'Continue Picking' : 'Pick Order'}
              </button>
            )}
            {status === 'Picked' && (
              <>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => router.push(`/transfers/${transfer!.id}/pick`)}>Edit Picking</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => setConfirmComplete(true)} disabled={busy}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Complete Transfer
                </button>
              </>
            )}
          </div>
        )}

        {mode === 'edit' && isDraft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Draft')} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
            <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Creating…' : isNew ? 'Create Transfer' : 'Submit Transfer'}
            </button>
          </div>
        )}
        {mode === 'edit' && !isDraft && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save()} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {confirmLeave && (
        <ConfirmModal
          title={isNew ? 'Cancel this transfer?' : 'Discard changes?'}
          message={isNew ? "Are you sure you want to cancel? This transfer hasn't been saved and everything you've entered will be lost." : "Are you sure you want to cancel? Any changes you've made will be lost."}
          confirmLabel={isNew ? 'Yes, cancel' : 'Yes, discard'} cancelLabel="Keep editing" danger
          onConfirm={() => { setConfirmLeave(false); if (isNew) router.push('/transfers'); else onDiscard() }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          title="Cancel transfer?"
          message={`Are you sure you want to cancel ${transfer?.tr_number ?? 'this transfer'}? It will move to Cancelled${anyPicked ? ' and anything already picked is released back to stock.' : '.'}`}
          confirmLabel="Yes, cancel transfer" danger busy={busy}
          onConfirm={cancelTransfer} onCancel={() => setConfirmCancel(false)}
        />
      )}
      {confirmComplete && (
        <ConfirmModal
          title="Complete transfer?"
          message={`The picked stock will move from ${fromLoc?.name ?? 'the From location'} to ${toLoc?.name ?? 'the To location'} and ${transfer?.tr_number ?? 'the transfer'} will be closed. This can't be undone.`}
          confirmLabel="Yes, complete transfer" busy={busy}
          onConfirm={completeTransfer} onCancel={() => setConfirmComplete(false)}
        />
      )}
    </div>
  )
}
