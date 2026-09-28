'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  tax_name?: string | null
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
  tax_name?: string | null
  line_notes: string | null
  batch_num: string | null
  expiry_date: string | null
  // Product tracking flags (passed from server)
  serial_tracking?: boolean | null
  batch_tracking?: boolean | null
  expiry_tracking?: boolean | null
}

// A single serial entry row within a receive line
type SerialEntry = {
  _key: string
  serial_number: string
}

// One "receive slot" for a PO line — may expand into multiple serial rows
type ReceiveLine = {
  id: string // PO line id
  product_id: string | null
  product_name: string | null
  product_sku: string | null
  unit: string | null
  quantity_ordered: number
  quantity_received: number // already received before this session
  // tracking flags
  needs_serial: boolean
  needs_batch: boolean
  needs_expiry: boolean
  // non-serial fields
  qty_to_receive: number
  batch_num: string
  expiry_date: string
  // serial entries (one per unit when serial_tracking)
  serials: SerialEntry[]
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

// ── Helpers ────────────────────────────────────────────────────────────────

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

function makeKey() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

// ── Expiry Date Input (same pattern as adjustments) ──────────────────────

function ExpiryInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [displayVal, setDisplayVal] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [calPos, setCalPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const calRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) { setDisplayVal(''); return }
    const [y, m, d] = value.split('-')
    if (y && m && d) setDisplayVal(`${d}/${m}/${y}`)
    else setDisplayVal(value)
  }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (!wrapRef.current?.contains(target) && !calRef.current?.contains(target)) setShowCal(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openCal = useCallback(() => {
    if (disabled) return
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setCalPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX })
    }
    setShowCal(true)
  }, [disabled])

  function handleType(raw: string) {
    if (disabled) return
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
    } else { onChange('') }
  }

  function pickDay(d: Date) { onChange(d.toISOString().split('T')[0]); setShowCal(false) }

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
    <div ref={calRef} style={{ position: 'absolute', top: calPos.top, left: calPos.left, zIndex: 9999, background: 'var(--white)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid var(--gray-100)', padding: 14, width: 240 }}>
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
          style={{ width: 110, paddingRight: 28, background: disabled ? 'var(--gray-50)' : undefined }}
          maxLength={10}
          autoComplete="off"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => showCal ? setShowCal(false) : openCal()}
          disabled={disabled}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 0, color: 'var(--gray-400)', display: 'flex', alignItems: 'center' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
      </div>
      {calendar}
    </div>
  )
}

// ── Confirm Modal ─────────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel, danger }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', background: danger ? 'var(--danger)' : undefined, borderColor: danger ? 'var(--danger)' : undefined }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

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
  const [confirmCancel, setConfirmCancel] = useState(false)

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
  const [lineErrors, setLineErrors] = useState<Record<number, Record<string, string>>>({})

  // ── Totals ───────────────────────────────────────────────────────────────
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

  // ── Enter Receive Mode ───────────────────────────────────────────────────
  function enterReceive() {
    // Only include lines that still have remaining qty
    const rl: ReceiveLine[] = lines
      .filter(l => (l.quantity_ordered - (l.quantity_received ?? 0)) > 0)
      .map(l => {
        const remaining = l.quantity_ordered - (l.quantity_received ?? 0)
        const needsSerial = !!l.serial_tracking
        return {
          id: l.id,
          product_id: l.product_id,
          product_name: l.product_name,
          product_sku: l.product_sku,
          unit: l.unit,
          quantity_ordered: l.quantity_ordered,
          quantity_received: l.quantity_received ?? 0,
          needs_serial: needsSerial,
          needs_batch: !!l.batch_tracking,
          needs_expiry: !!l.expiry_tracking,
          qty_to_receive: remaining,
          batch_num: l.batch_num ?? '',
          expiry_date: l.expiry_date ?? '',
          serials: needsSerial
            ? Array.from({ length: remaining }, () => ({ _key: makeKey(), serial_number: '' }))
            : [],
        }
      })
    setReceiveLines(rl)
    setReceiveNotes('')
    setLineErrors({})
    setError(null)
    setMode('receive')
  }

  // ── Receive line helpers ─────────────────────────────────────────────────
  function updateReceiveLine(idx: number, field: keyof ReceiveLine, value: string | number) {
    setReceiveLines(prev => prev.map((l, i): ReceiveLine => {
      if (i !== idx) return l
      if (field === 'qty_to_receive' && !l.needs_serial) {
        return { ...l, qty_to_receive: Number(value) }
      }
      return { ...l, [field]: value } as ReceiveLine
    }))
    // Clear errors for this field
    if (lineErrors[idx]?.[field as string]) {
      setLineErrors(prev => {
        const next = { ...prev }
        if (next[idx]) {
          delete next[idx][field as string]
          if (!Object.keys(next[idx]).length) delete next[idx]
        }
        return next
      })
    }
  }

  // Update a serial entry in a receive line
  function updateSerial(lineIdx: number, serialIdx: number, value: string) {
    // Support paste of multiple serials (newline separated)
    const parts = value.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean)
    setReceiveLines(prev => prev.map((l, i) => {
      if (i !== lineIdx) return l
      const serials = [...l.serials]
      if (parts.length > 1) {
        // Paste: fill from this position, adding rows as needed
        for (let j = 0; j < parts.length; j++) {
          const targetIdx = serialIdx + j
          if (targetIdx < serials.length) {
            serials[targetIdx] = { ...serials[targetIdx], serial_number: parts[j] }
          } else {
            serials.push({ _key: makeKey(), serial_number: parts[j] })
          }
        }
      } else {
        serials[serialIdx] = { ...serials[serialIdx], serial_number: value }
      }
      return { ...l, serials, qty_to_receive: serials.length }
    }))
    // Clear serial errors
    setLineErrors(prev => {
      const next = { ...prev }
      if (next[lineIdx]) {
        delete next[lineIdx][`serial_${serialIdx}`]
        delete next[lineIdx].serials
        if (!Object.keys(next[lineIdx]).length) delete next[lineIdx]
      }
      return next
    })
  }

  function addSerialRow(lineIdx: number) {
    setReceiveLines(prev => prev.map((l, i) => {
      if (i !== lineIdx) return l
      const serials = [...l.serials, { _key: makeKey(), serial_number: '' }]
      return { ...l, serials, qty_to_receive: serials.length }
    }))
  }

  function removeSerialRow(lineIdx: number, serialIdx: number) {
    setReceiveLines(prev => prev.map((l, i) => {
      if (i !== lineIdx) return l
      if (l.serials.length <= 1) return l // keep at least 1
      const serials = l.serials.filter((_, j) => j !== serialIdx)
      return { ...l, serials, qty_to_receive: serials.length }
    }))
  }

  // ── Validation ───────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: Record<number, Record<string, string>> = {}
    receiveLines.forEach((l, idx) => {
      const e: Record<string, string> = {}
      const remaining = l.quantity_ordered - l.quantity_received

      if (l.needs_serial) {
        // All serial fields must be filled
        const serials = l.serials
        if (serials.length === 0) {
          e.serials = 'Enter at least one serial number'
        } else {
          const seenInLine = new Set<string>()
          serials.forEach((s, si) => {
            if (!s.serial_number.trim()) {
              e[`serial_${si}`] = 'Required'
            } else if (seenInLine.has(s.serial_number.trim())) {
              e[`serial_${si}`] = 'Duplicate'
            } else {
              seenInLine.add(s.serial_number.trim())
            }
          })
          if (serials.length > remaining) {
            e.serials = `Cannot receive more than ${remaining} units (remaining on order)`
          }
        }
        if (l.needs_batch && !l.batch_num.trim()) e.batch_num = 'Batch number required'
        if (l.needs_expiry && !l.expiry_date) e.expiry_date = 'Expiry date required'
      } else {
        if (l.qty_to_receive > remaining) {
          e.qty_to_receive = `Max ${remaining}`
        }
        if (l.qty_to_receive < 0) e.qty_to_receive = 'Must be 0 or more'
        if (l.needs_batch && l.qty_to_receive > 0 && !l.batch_num.trim()) e.batch_num = 'Batch number required'
        if (l.needs_expiry && l.qty_to_receive > 0 && !l.expiry_date) e.expiry_date = 'Expiry date required'
      }

      if (Object.keys(e).length) errs[idx] = e
    })
    setLineErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit Receipt ────────────────────────────────────────────────────────
  async function submitReceive() {
    const totalToReceive = receiveLines.reduce((sum, l) => {
      return sum + (l.needs_serial ? l.serials.filter(s => s.serial_number.trim()).length : Number(l.qty_to_receive))
    }, 0)
    if (totalToReceive <= 0) { setError('Enter a quantity to receive for at least one line.'); return }
    if (!validate()) { setError('Please fix the errors below before confirming.'); return }

    setSaving(true)
    setError(null)

    const payload = {
      lines: receiveLines.map(l => ({
        id: l.id,
        qty_to_receive: l.needs_serial ? l.serials.filter(s => s.serial_number.trim()).length : Number(l.qty_to_receive),
        batch_num: l.batch_num || null,
        expiry_date: l.expiry_date || null,
        serial_numbers: l.needs_serial ? l.serials.filter(s => s.serial_number.trim()).map(s => s.serial_number.trim()) : null,
        new_quantity_received: l.quantity_received + (l.needs_serial ? l.serials.filter(s => s.serial_number.trim()).length : Number(l.qty_to_receive)),
      })),
      notes: receiveNotes || null,
    }

    const res = await fetch(`/api/org/purchases/${po.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }

    // Update local state: mark received lines as immutable
    const updatedLines = lines.map(l => {
      const rl = receiveLines.find(r => r.id === l.id)
      if (!rl) return l
      const qtyNow = rl.needs_serial
        ? rl.serials.filter(s => s.serial_number.trim()).length
        : Number(rl.qty_to_receive)
      return {
        ...l,
        quantity_received: (l.quantity_received ?? 0) + qtyNow,
        batch_num: rl.batch_num || l.batch_num,
        expiry_date: rl.expiry_date || l.expiry_date,
      }
    })
    setLines(updatedLines)
    setPo(prev => ({ ...prev, status: data.new_status }))
    setMode('view')
  }

  // ── Edit Mode ─────────────────────────────────────────────────────────────
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
    const res = await fetch(`/api/org/purchases/${po.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    if (res.ok) setPo(prev => ({ ...prev, status: 'Cancelled' }))
    setConfirmCancel(false)
  }

  const filteredSuppliers = contacts.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))

  // Derived receive summary
  const totalReceivingNow = receiveLines.reduce((sum, l) => {
    return sum + (l.needs_serial ? l.serials.filter(s => s.serial_number.trim()).length : Number(l.qty_to_receive))
  }, 0)

  // ── Serial tracking: does anything in this PO use it?
  const anySerial = lines.some(l => l.serial_tracking)
  const anyBatch  = lines.some(l => l.batch_tracking)
  const anyExpiry = lines.some(l => l.expiry_tracking)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
      onClick={() => { setTermsOpen(false); setLocationOpen(false); setSupplierOpen(false) }}
    >
      {confirmCancel && (
        <ConfirmModal
          title="Cancel Purchase Order"
          message="Are you sure you want to cancel this purchase order? This cannot be undone."
          confirmLabel="Cancel Order"
          danger
          onConfirm={cancelOrder}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => mode !== 'view' ? setMode('view') : router.push('/purchases')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>
              {mode === 'receive' ? `Receive Stock — ${po.po_number ?? 'PO'}` : po.po_number ?? 'Purchase Order'}
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

      {/* ══════════════════════════════════════════════════════════════════════
          RECEIVE MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {mode === 'receive' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>
            {error && (
              <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
            )}

            {/* Info banner */}
            <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div style={{ fontSize: 13, color: 'var(--teal)', lineHeight: 1.5 }}>
                <strong>Receiving into:</strong> {po.location_name ?? '—'}&nbsp;·&nbsp;<strong>PO:</strong> {po.po_number ?? '—'}
                {receiveLines.length === 0 && <span style={{ marginLeft: 12, color: '#059669', fontWeight: 700 }}>✓ All items already fully received</span>}
              </div>
            </div>

            {receiveLines.length === 0 && (
              <div className="npo-card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--gray-400)', fontSize: 14 }}>
                All line items on this order have been fully received.
              </div>
            )}

            {/* Receive lines */}
            {receiveLines.map((rl, idx) => {
              const remaining = rl.quantity_ordered - rl.quantity_received
              const errs = lineErrors[idx] ?? {}
              const receivingCount = rl.needs_serial
                ? rl.serials.filter(s => s.serial_number.trim()).length
                : Number(rl.qty_to_receive)

              return (
                <div key={rl.id} className="npo-card" style={{ marginBottom: 16, overflow: 'visible' }}>
                  {/* Line header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 5 }}>{rl.product_sku ?? '—'}</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>{rl.product_name ?? '—'}</span>
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', gap: 12, fontSize: 12, color: 'var(--gray-400)' }}>
                        <span>Ordered: <strong style={{ color: 'var(--slate)' }}>{rl.quantity_ordered}</strong></span>
                        <span>Already received: <strong style={{ color: '#059669' }}>{rl.quantity_received}</strong></span>
                        <span>Remaining: <strong style={{ color: remaining > 0 ? 'var(--danger)' : '#059669' }}>{remaining}</strong></span>
                      </div>
                      {(rl.needs_serial || rl.needs_batch || rl.needs_expiry) && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                          {rl.needs_serial && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '2px 7px', borderRadius: 20, letterSpacing: '0.04em' }}>SERIAL</span>}
                          {rl.needs_batch  && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '2px 7px', borderRadius: 20, letterSpacing: '0.04em' }}>BATCH</span>}
                          {rl.needs_expiry && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '2px 7px', borderRadius: 20, letterSpacing: '0.04em' }}>EXPIRY</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: receivingCount > 0 ? 'var(--teal)' : 'var(--gray-400)', textAlign: 'right' }}>
                      {receivingCount > 0 ? `+${receivingCount} receiving` : 'Skip (0)'}
                    </div>
                  </div>

                  {/* ── SERIAL TRACKED ── */}
                  {rl.needs_serial ? (
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        <label className="modal-label" style={{ marginBottom: 6, display: 'block' }}>
                          Serial Numbers — paste multiple on separate lines, or enter one per row
                        </label>
                        {errs.serials && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginBottom: 6 }}>{errs.serials}</div>}

                        {rl.serials.map((s, si) => (
                          <div key={s._key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--gray-400)', minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{si + 1}.</span>
                            <input
                              className={`modal-input${errs[`serial_${si}`] ? ' li-input-error' : ''}`}
                              style={{ flex: 1, background: 'var(--gray-50)' }}
                              placeholder={`Serial number ${si + 1}…`}
                              value={s.serial_number}
                              onChange={e => updateSerial(idx, si, e.target.value)}
                              autoComplete="off"
                            />
                            {errs[`serial_${si}`] && (
                              <span style={{ fontSize: 11, color: 'var(--danger)', whiteSpace: 'nowrap' }}>{errs[`serial_${si}`]}</span>
                            )}
                            {rl.serials.length > 1 && (
                              <button
                                onClick={() => removeSerialRow(idx, si)}
                                style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)', flexShrink: 0 }}
                                onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                                onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Add serial row button */}
                        <button
                          onClick={() => addSerialRow(idx)}
                          style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1.5px dashed var(--gray-200)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', fontWeight: 600 }}
                          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' }}
                          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-400)' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Add serial row
                        </button>
                      </div>

                      {/* Batch / Expiry for serial items */}
                      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                        {rl.needs_batch && (
                          <div className="modal-field" style={{ flex: 1, minWidth: 180 }}>
                            <label className="modal-label">Batch / Lot # <span className="req">*</span></label>
                            <input
                              className={`modal-input${errs.batch_num ? ' li-input-error' : ''}`}
                              value={rl.batch_num}
                              onChange={e => updateReceiveLine(idx, 'batch_num', e.target.value)}
                              placeholder="Batch number…"
                              style={{ background: 'var(--gray-50)' }}
                            />
                            {errs.batch_num && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errs.batch_num}</div>}
                          </div>
                        )}
                        {rl.needs_expiry && (
                          <div className="modal-field">
                            <label className="modal-label">Expiry Date <span className="req">*</span></label>
                            <ExpiryInput value={rl.expiry_date} onChange={v => updateReceiveLine(idx, 'expiry_date', v)} />
                            {errs.expiry_date && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errs.expiry_date}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── NON-SERIAL ── */
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="modal-field" style={{ minWidth: 130 }}>
                        <label className="modal-label">Receive Now</label>
                        <input
                          className={`li-input right${errs.qty_to_receive ? ' li-input-error' : ''}`}
                          type="number"
                          min="0"
                          max={remaining}
                          value={rl.qty_to_receive}
                          onChange={e => updateReceiveLine(idx, 'qty_to_receive', parseFloat(e.target.value) || 0)}
                          onFocus={e => e.target.select()}
                          style={{ width: 100, textAlign: 'right' }}
                        />
                        {errs.qty_to_receive && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errs.qty_to_receive}</div>}
                      </div>
                      {rl.needs_batch && (
                        <div className="modal-field" style={{ flex: 1, minWidth: 160 }}>
                          <label className="modal-label">Batch / Lot # {rl.qty_to_receive > 0 && <span className="req">*</span>}</label>
                          <input
                            className={`modal-input${errs.batch_num ? ' li-input-error' : ''}`}
                            value={rl.batch_num}
                            onChange={e => updateReceiveLine(idx, 'batch_num', e.target.value)}
                            placeholder="Batch number…"
                            style={{ background: 'var(--gray-50)' }}
                          />
                          {errs.batch_num && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errs.batch_num}</div>}
                        </div>
                      )}
                      {rl.needs_expiry && (
                        <div className="modal-field">
                          <label className="modal-label">Expiry Date {rl.qty_to_receive > 0 && <span className="req">*</span>}</label>
                          <ExpiryInput value={rl.expiry_date} onChange={v => updateReceiveLine(idx, 'expiry_date', v)} />
                          {errs.expiry_date && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errs.expiry_date}</div>}
                        </div>
                      )}
                      {!rl.needs_batch && !rl.needs_expiry && (
                        <div style={{ paddingBottom: 6, fontSize: 12, color: 'var(--gray-400)' }}>
                          of {remaining} remaining
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Receiving notes */}
            {receiveLines.length > 0 && (
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
            )}
          </div>

          {/* Bottom bar — receive */}
          <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            <button onClick={() => setMode('view')} className="btn btn-outline" style={{ height: 38 }}>Cancel</button>
            {receiveLines.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                  Receiving <strong style={{ color: 'var(--slate)' }}>{totalReceivingNow}</strong> unit{totalReceivingNow !== 1 ? 's' : ''} into <strong style={{ color: 'var(--slate)' }}>{po.location_name}</strong>
                </div>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={submitReceive} disabled={saving}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {saving ? 'Receiving…' : 'Confirm Receipt'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW / EDIT MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {mode !== 'receive' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={() => { setTermsOpen(false); setLocationOpen(false); setSupplierOpen(false) }}>
            {error && (
              <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
            )}

            {/* Supplier + Deliver To */}
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
                  {mode === 'view'
                    ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{fmtDate(po.order_date)}</div>
                    : <input className="modal-input" type="date" value={editOrderDate} onChange={e => setEditOrderDate(e.target.value)} style={{ background: 'var(--white)' }} />}
                </div>
                <div className="modal-field">
                  <label className="modal-label">Expected Delivery</label>
                  {mode === 'view'
                    ? <div style={{ fontSize: 13, fontWeight: 500, color: po.expected_date && new Date(po.expected_date) < new Date() && !['closed','cancelled'].includes(po.status.toLowerCase()) ? 'var(--danger)' : 'var(--slate)', padding: '4px 0' }}>{fmtDate(po.expected_date)}</div>
                    : <input className="modal-input" type="date" value={editExpectedDate} onChange={e => setEditExpectedDate(e.target.value)} style={{ background: 'var(--white)' }} />}
                </div>
                <div className="modal-field" onClick={e => e.stopPropagation()}>
                  <label className="modal-label">Payment Terms</label>
                  {mode === 'view'
                    ? <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0' }}>{po.terms ?? '—'}</div>
                    : (
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
                  {mode === 'view'
                    ? <div style={{ fontSize: 13, color: po.notes ? 'var(--slate)' : 'var(--gray-400)', padding: '4px 0', lineHeight: 1.5 }}>{po.notes || '—'}</div>
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
                      <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Ordered</th>
                      <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Received</th>
                      <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Remaining</th>
                      <th className="li-th" style={{ width: 90, textAlign: 'right' }}>Cost Price</th>
                      <th className="li-th" style={{ width: 60, textAlign: 'right' }}>Disc %</th>
                      <th className="li-th" style={{ width: 55, textAlign: 'right' }}>Tax</th>
                      <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Line Total</th>
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
                      const fullyReceived = remaining <= 0
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku ?? '—'}</span></td>
                          <td className="li-td">
                            <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name ?? '—'}</span>
                            {l.batch_num && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>Batch: {l.batch_num}</div>}
                            {l.expiry_date && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Exp: {fmtDate(l.expiry_date)}</div>}
                            {(l.serial_tracking || l.batch_tracking || l.expiry_tracking) && (
                              <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                                {l.serial_tracking && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '1px 5px', borderRadius: 20, letterSpacing: '0.04em' }}>SERIAL</span>}
                                {l.batch_tracking  && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '1px 5px', borderRadius: 20, letterSpacing: '0.04em' }}>BATCH</span>}
                                {l.expiry_tracking && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '1px 5px', borderRadius: 20, letterSpacing: '0.04em' }}>EXPIRY</span>}
                              </div>
                            )}
                            {fullyReceived && <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>✓ Fully received</div>}
                          </td>
                          <td className="li-td" style={{ textAlign: 'center', color: 'var(--gray-400)' }}>{l.unit ?? '—'}</td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{l.quantity_ordered}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>{received}</td>
                          <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : '#059669' }}>{remaining}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{`$${l.unit_cost.toFixed(2)}`}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.discount ? `${l.discount}%` : '—'}</td>
                          <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.tax_name ?? (l.tax_rate ? `${l.tax_rate}%` : '—')}</td>
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
                            <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{l.tax_name ?? (l.tax_rate ? `${l.tax_rate}%` : '—')}</td>
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

          {/* Bottom bar — view/edit */}
          <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            {mode === 'view' ? (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => router.push('/purchases')} className="btn btn-outline" style={{ height: 38 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    Back
                  </button>
                  {canCancel && (
                    <button onClick={() => setConfirmCancel(true)} className="btn btn-outline" style={{ height: 38, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      Cancel Order
                    </button>
                  )}
                </div>
                {canReceive && (
                  <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={enterReceive}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Receive Stock
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
