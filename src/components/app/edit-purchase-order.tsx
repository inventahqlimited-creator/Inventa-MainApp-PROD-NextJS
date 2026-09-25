'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

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
  price_level_id?: string | null
}

type Location = {
  id: string
  name: string
  address: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
}

type Product = {
  id: string
  name: string
  sku: string | null
  buy_uom: string | null
  cost_price: number | null
  tax_rate: string | null
  description: string | null
  track_stock: boolean | null
  type: string
  price_levels?: { price_level_id: string; price: number }[]
}

type PriceLevel = {
  id: string
  name: string
}

type LineItem = {
  id?: string
  product_id: string
  product_name: string
  product_sku: string
  unit: string
  quantity_ordered: number
  unit_cost: number
  discount: number
  tax_rate: number
  line_notes: string
}

type CostLine = {
  id?: string
  product_id: string
  product_name: string
  product_sku: string
  description: string
  amount: number
  tax_rate: number
}

type PurchaseOrder = {
  id: string
  po_number: string | null
  status: string
  supplier_id: string | null
  supplier_name: string | null
  location_id: string | null
  location_name: string | null
  order_date: string | null
  expected_date: string | null
  terms: string | null
  notes: string | null
  reference: string | null
  currency: string | null
  total_amount: number | null
  order_discount: number | null
  order_discount_type: string | null
  order_discount_amount: number | null
  lines: LineItem[]
  cost_lines: CostLine[]
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`
}

function parseTaxRate(str: string | null): number {
  if (!str) return 0
  const m = str.match(/(\d+)%/)
  return m ? parseInt(m[1]) : 0
}

function lineTotal(l: LineItem) {
  return l.quantity_ordered * l.unit_cost * (1 - l.discount / 100)
}

function statusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status.toLowerCase()) {
    case 'draft':
      return { label: 'Draft', color: '#92400E', bg: '#FEF3C7' }
    case 'open':
      return { label: 'Open', color: '#065F46', bg: '#D1FAE5' }
    case 'partially received':
      return { label: 'Partially Received', color: '#1E40AF', bg: '#DBEAFE' }
    case 'closed':
      return { label: 'Closed', color: '#374151', bg: '#F3F4F6' }
    case 'cancelled':
      return { label: 'Cancelled', color: '#991B1B', bg: '#FEE2E2' }
    default:
      return { label: status, color: '#374151', bg: '#F3F4F6' }
  }
}

function isEditable(status: string) {
  const s = status.toLowerCase()
  return s === 'draft' || s === 'open'
}

export default function EditPurchaseOrder({
  orgId,
  order,
  suppliers,
  locations,
  products,
  defaultTerms,
  priceLevels = [],
}: {
  orgId: string
  order: PurchaseOrder
  suppliers: Supplier[]
  locations: Location[]
  products: Product[]
  defaultTerms?: string | null
  priceLevels?: PriceLevel[]
}) {
  const router = useRouter()
  const editable = isEditable(order.status)
  const badge = statusBadge(order.status)
  const fallbackTerms = defaultTerms ?? 'Net 14'

  // Initialise supplier from order data
  const initialSupplier = order.supplier_id
    ? suppliers.find(s => s.id === order.supplier_id) ?? null
    : null

  // Initialise location from order data
  const initialLocation = order.location_id
    ? locations.find(l => l.id === order.location_id) ?? null
    : null

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(initialSupplier)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDropOpen, setSupplierDropOpen] = useState(false)
  const [supplierOrderNum, setSupplierOrderNum] = useState(order.reference ?? '')
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(initialLocation)
  const [locationOpen, setLocationOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(order.order_date ?? new Date().toISOString().split('T')[0])
  const [expectedDate, setExpectedDate] = useState(order.expected_date ?? '')
  const [terms, setTerms] = useState(order.terms ?? fallbackTerms)
  const [termsOpen, setTermsOpen] = useState(false)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [lines, setLines] = useState<LineItem[]>(order.lines ?? [])
  const [costLines, setCostLines] = useState<CostLine[]>(order.cost_lines ?? [])
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [costSearch, setCostSearch] = useState('')
  const [costDropOpen, setCostDropOpen] = useState(false)
  const [orderDiscountType, setOrderDiscountType] = useState<'%' | '$'>(
    (order.order_discount_type as '%' | '$') ?? '%'
  )
  const [orderDiscount, setOrderDiscount] = useState<number>(order.order_discount ?? 0)
  const [supplierPriceLevelId, setSupplierPriceLevelId] = useState<string | null>(
    initialSupplier?.price_level_id ?? null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredSuppliers = useMemo(() =>
    suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())),
    [suppliers, supplierSearch]
  )

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      (p.type === 'Stock' || p.type === 'NonStock') && (
        p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        (p.sku ?? '').toLowerCase().includes(itemSearch.toLowerCase())
      )
    ).slice(0, 20),
    [products, itemSearch]
  )

  const filteredCostProducts = useMemo(() =>
    products.filter(p =>
      p.type === 'Service' && (
        p.name.toLowerCase().includes(costSearch.toLowerCase()) ||
        (p.sku ?? '').toLowerCase().includes(costSearch.toLowerCase())
      )
    ).slice(0, 20),
    [products, costSearch]
  )

  function selectSupplier(s: Supplier & { price_level_id?: string | null }) {
    setSelectedSupplier(s)
    setTerms(s.terms ?? defaultTerms ?? 'Net 14')
    setSupplierPriceLevelId(s.price_level_id ?? null)
    setSupplierDropOpen(false)
  }

  function resolvePrice(p: Product): number {
    if (supplierPriceLevelId && p.price_levels) {
      const match = p.price_levels.find(pl => pl.price_level_id === supplierPriceLevelId)
      if (match != null) return match.price
    }
    return p.cost_price ?? 0
  }

  function addLine(p: Product) {
    setLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      unit: p.buy_uom ?? 'Each',
      quantity_ordered: 1,
      unit_cost: resolvePrice(p),
      discount: 0,
      tax_rate: parseTaxRate(p.tax_rate),
      line_notes: '',
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

  function addCostLine(p: Product) {
    setCostLines(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku ?? '',
      description: p.description ?? '',
      amount: p.cost_price ?? 0,
      tax_rate: parseTaxRate(p.tax_rate),
    }])
    setCostSearch('')
    setCostDropOpen(false)
  }

  function updateCostLine(idx: number, field: keyof CostLine, value: string | number) {
    setCostLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeCostLine(idx: number) {
    setCostLines(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lines.reduce((sum, l) => {
    return sum + l.quantity_ordered * l.unit_cost * (1 - l.discount / 100)
  }, 0)

  const additionalCostsTotal = costLines.reduce((sum, l) => sum + l.amount, 0)

  const preDiscountTotal = subtotal + additionalCostsTotal

  const orderDiscountAmount = orderDiscountType === '%'
    ? preDiscountTotal * (orderDiscount / 100)
    : Math.min(orderDiscount, preDiscountTotal)

  const discountedBase = preDiscountTotal - orderDiscountAmount

  const gstTotal = lines.reduce((sum, l) => {
    const lt = l.quantity_ordered * l.unit_cost * (1 - l.discount / 100)
    const discountFactor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
    return sum + lt * discountFactor * (l.tax_rate / 100)
  }, 0) + costLines.reduce((sum, l) => {
    const discountFactor = preDiscountTotal > 0 ? discountedBase / preDiscountTotal : 1
    return sum + l.amount * discountFactor * (l.tax_rate / 100)
  }, 0)

  const total = discountedBase + gstTotal

  async function save(newStatus: string) {
    if (!selectedSupplier) { setError('Please select a supplier.'); return }
    if (!selectedLocation) { setError('Please select a delivery location.'); return }
    if (lines.length === 0) { setError('Add at least one line item.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      id: order.id,
      supplier_id: selectedSupplier.id,
      supplier_name: selectedSupplier.name,
      location_id: selectedLocation.id,
      location_name: selectedLocation.name,
      status: newStatus,
      order_date: orderDate,
      expected_date: expectedDate || null,
      reference: supplierOrderNum || null,
      terms,
      notes: notes || null,
      currency: selectedSupplier.currency ?? order.currency ?? 'NZD',
      total_amount: total,
      order_discount: orderDiscount || null,
      order_discount_type: orderDiscount > 0 ? orderDiscountType : null,
      order_discount_amount: orderDiscountAmount > 0 ? orderDiscountAmount : null,
      lines: lines.map((l, i) => ({ ...l, sort_order: i })),
      cost_lines: costLines.map((l, i) => ({ ...l, sort_order: i })),
    }

    try {
      const res = await fetch(`/api/org/purchases/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      router.refresh()
      router.push(`/purchases/${order.id}`)
    } catch {
      setSaving(false)
      setError('Network error — please try again.')
    }
  }

  const closeAll = () => {
    setSupplierDropOpen(false)
    setLocationOpen(false)
    setTermsOpen(false)
    setItemDropOpen(false)
    setCostDropOpen(false)
  }

  const statusLower = order.status.toLowerCase()
  const isDraft = statusLower === 'draft'
  const isOpen = statusLower === 'open'
  const isReadOnly = !editable

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/purchases')} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>
              {order.po_number ?? 'Purchase Order'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              {order.supplier_name ?? 'No supplier selected'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-ui)',
            padding: '3px 10px', borderRadius: 99,
            color: badge.color, background: badge.bg,
            letterSpacing: '0.02em',
          }}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }} onClick={closeAll}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>
        )}

        {isReadOnly && (
          <div style={{ background: '#F8FAFC', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--gray-400)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            This order is <strong style={{ color: 'var(--slate)' }}>{badge.label}</strong> and cannot be edited.
          </div>
        )}

        {/* Row 1: Supplier + Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>

          {/* Supplier card */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Supplier
            </div>

            {!selectedSupplier ? (
              editable ? (
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    className="modal-input"
                    placeholder="Search suppliers…"
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    onFocus={() => setSupplierDropOpen(true)}
                    style={{ paddingLeft: 32, background: 'var(--gray-50)' }}
                    autoComplete="off"
                  />
                  {supplierDropOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', maxHeight: 220, overflowY: 'auto', zIndex: 100, padding: 6 }}>
                      {filteredSuppliers.length === 0 ? (
                        <div style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: 13 }}>No suppliers found</div>
                      ) : filteredSuppliers.map(s => (
                        <div key={s.id} className="fp-item" onClick={() => selectSupplier(s)}>
                          <div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{s.name}</div>
                          {s.email && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{s.email}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '10px 0' }}>No supplier selected</div>
              )
            ) : (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{selectedSupplier.name}</div>
                    {selectedSupplier.phone && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{selectedSupplier.phone}</div>}
                    {selectedSupplier.email && <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 2 }}>{selectedSupplier.email}</div>}
                    {selectedSupplier.bill_city && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{[selectedSupplier.bill_city, selectedSupplier.bill_country].filter(Boolean).join(', ')}</div>}
                  </div>
                  {editable && (
                    <button
                      onClick={() => { setSelectedSupplier(null); setTerms(fallbackTerms); setSupplierPriceLevelId(null) }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="modal-field" style={{ marginTop: 12 }}>
              <label className="modal-label">Supplier Order #</label>
              <input
                className="modal-input"
                value={supplierOrderNum}
                onChange={e => setSupplierOrderNum(e.target.value)}
                placeholder="Supplier's reference number"
                style={{ background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
          </div>

          {/* Deliver To card */}
          <div className="npo-card">
            <div className="npo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Deliver To
            </div>

            {!selectedLocation ? (
              editable ? (
                <div className="modal-field" onClick={e => e.stopPropagation()}>
                  <label className="modal-label">Location <span className="req">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <button className="modal-dd-btn" onClick={() => setLocationOpen(o => !o)} type="button" style={{ background: 'var(--white)' }}>
                      <span style={{ color: 'var(--gray-400)' }}>Select location…</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {locationOpen && (
                      <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                        <div className="col-dropdown-title">Deliver To</div>
                        {locations.map(l => (
                          <div key={l.id} className="fp-item" onClick={() => { setSelectedLocation(l); setLocationOpen(false) }}>{l.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '10px 0' }}>No location selected</div>
              )
            ) : (
              <div style={{ background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{selectedLocation.name}</div>
                    {selectedLocation.phone && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{selectedLocation.phone}</div>}
                    {selectedLocation.email && <div style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 2 }}>{selectedLocation.email}</div>}
                    {(selectedLocation.address || selectedLocation.city) && (
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                        {[selectedLocation.address, selectedLocation.city, selectedLocation.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  {editable && (
                    <button
                      onClick={() => setSelectedLocation(null)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(13,148,136,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Details card */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Order Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 4 }}>
            <div className="modal-field">
              <label className="modal-label">Order Date <span className="req">*</span></label>
              <input
                className="modal-input"
                type="date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                style={{ background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Expected Delivery</label>
              <input
                className="modal-input"
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                style={{ background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
            <div className="modal-field" onClick={e => e.stopPropagation()}>
              <label className="modal-label">Payment Terms</label>
              {editable ? (
                <div style={{ position: 'relative' }}>
                  <button className="modal-dd-btn" onClick={() => setTermsOpen(o => !o)} type="button" style={{ background: 'var(--white)' }}>
                    <span>{terms}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {termsOpen && (
                    <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 160 }}>
                      <div className="col-dropdown-title">Payment Terms</div>
                      {['Net 7', 'Net 14', 'Net 30', 'Net 60', 'COD', 'Prepaid'].map(t => (
                        <div key={t} className={`fp-item${terms === t ? ' active' : ''}`} onClick={() => { setTerms(t); setTermsOpen(false) }}>{t}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="modal-input" style={{ background: 'var(--gray-50)', color: 'var(--slate)', cursor: 'default' }}>{terms || '—'}</div>
              )}
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 3' }}>
              <label className="modal-label">Comments / Notes</label>
              <textarea
                className="modal-input"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes or instructions for this order…"
                style={{ resize: 'vertical', height: 60, lineHeight: 1.5, background: 'var(--white)' }}
                readOnly={isReadOnly}
              />
            </div>
          </div>
        </div>

        {/* Line Items card */}
        <div className="npo-card" style={{ overflow: 'visible' }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            Line Items
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th className="li-th" style={{ width: 120 }}>SKU</th>
                  <th className="li-th">Product Name</th>
                  <th className="li-th" style={{ width: 70, textAlign: 'center' }}>Unit</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Qty</th>
                  <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Cost Price</th>
                  <th className="li-th" style={{ width: 80, textAlign: 'right' }}>Disc %</th>
                  <th className="li-th" style={{ width: 70, textAlign: 'right' }}>Tax</th>
                  <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                  {editable && <th className="li-th" style={{ width: 36 }} />}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={editable ? 9 : 8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      {editable ? 'No items added. Search below to add products.' : 'No line items on this order.'}
                    </td>
                  </tr>
                )}
                {lines.map((l, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                    <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                    <td className="li-td" style={{ textAlign: 'center' }}>
                      {editable
                        ? <input className="li-input" value={l.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} style={{ width: 60, textAlign: 'center' }} />
                        : <span style={{ fontSize: 13 }}>{l.unit}</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <input className="li-input right" type="number" min="1" step="1" value={l.quantity_ordered} onChange={e => updateLine(idx, 'quantity_ordered', parseFloat(e.target.value) || 0)} style={{ width: 70, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.quantity_ordered}</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <input className="li-input right" type="number" min="0" step="0.01" value={l.unit_cost} onChange={e => updateLine(idx, 'unit_cost', parseFloat(e.target.value) || 0)} style={{ width: 90, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>{fmtMoney(l.unit_cost)}</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <input className="li-input right" type="number" min="0" max="100" step="0.1" value={l.discount} onChange={e => updateLine(idx, 'discount', parseFloat(e.target.value) || 0)} style={{ width: 70, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.discount}%</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right' }}>
                      {editable
                        ? <input className="li-input right" type="number" min="0" max="100" step="1" value={l.tax_rate} onChange={e => updateLine(idx, 'tax_rate', parseFloat(e.target.value) || 0)} style={{ width: 60, textAlign: 'right' }} />
                        : <span style={{ fontSize: 13 }}>{l.tax_rate}%</span>
                      }
                    </td>
                    <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                      {fmtMoney(lineTotal(l))}
                    </td>
                    {editable && (
                      <td className="li-td">
                        <button
                          onClick={() => removeLine(idx)}
                          style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add item search — only when editable */}
          {editable && (
            <div style={{ padding: '10px 0 2px', position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="modal-input"
                placeholder="Search by item code or name…"
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); if (!itemDropOpen) setItemDropOpen(true) }}
                onFocus={() => setItemDropOpen(true)}
                style={{ paddingLeft: 32, background: 'var(--gray-50)', width: 300 }}
                autoComplete="off"
              />
              {itemDropOpen && filteredProducts.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 500, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '8px 14px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Product</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>SKU</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Price</span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                    {filteredProducts.map(p => (
                      <div
                        key={p.id}
                        className="fp-item"
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', alignItems: 'center', gap: 8 }}
                        onMouseDown={e => { e.preventDefault(); addLine(p) }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                        <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>{p.cost_price ? `$${p.cost_price.toFixed(2)}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional Costs */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--gray-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-400)' }}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Additional Costs</span>
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Freight, packing and other service charges</span>
            </div>

            {costLines.length > 0 && (
              <div style={{ overflowX: 'auto', margin: '0 -20px', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      <th className="li-th" style={{ width: 120 }}>SKU</th>
                      <th className="li-th">Name</th>
                      <th className="li-th">Description</th>
                      <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Amount</th>
                      <th className="li-th" style={{ width: 70, textAlign: 'right' }}>Tax</th>
                      <th className="li-th" style={{ width: 110, textAlign: 'right' }}>Line Total</th>
                      {editable && <th className="li-th" style={{ width: 36 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {costLines.map((l, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{l.product_sku}</span></td>
                        <td className="li-td"><span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</span></td>
                        <td className="li-td">
                          {editable
                            ? <input className="li-input" value={l.description} onChange={e => updateCostLine(idx, 'description', e.target.value)} placeholder="Optional description…" style={{ width: '100%', minWidth: 160 }} />
                            : <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>{l.description || '—'}</span>
                          }
                        </td>
                        <td className="li-td" style={{ textAlign: 'right' }}>
                          {editable
                            ? <input className="li-input right" type="number" min="0" step="0.01" value={l.amount} onChange={e => updateCostLine(idx, 'amount', parseFloat(e.target.value) || 0)} style={{ width: 90, textAlign: 'right' }} />
                            : <span style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>{fmtMoney(l.amount)}</span>
                          }
                        </td>
                        <td className="li-td" style={{ textAlign: 'right' }}>
                          {editable
                            ? <input className="li-input right" type="number" min="0" max="100" step="1" value={l.tax_rate} onChange={e => updateCostLine(idx, 'tax_rate', parseFloat(e.target.value) || 0)} style={{ width: 60, textAlign: 'right' }} />
                            : <span style={{ fontSize: 13 }}>{l.tax_rate}%</span>
                          }
                        </td>
                        <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                          {fmtMoney(l.amount * (1 + l.tax_rate / 100))}
                        </td>
                        {editable && (
                          <td className="li-td">
                            <button
                              onClick={() => removeCostLine(idx)}
                              style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}
                              onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cost item search — only when editable */}
            {editable && (
              <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none', zIndex: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="modal-input"
                  placeholder="Search non-stock items…"
                  value={costSearch}
                  onChange={e => { setCostSearch(e.target.value); if (!costDropOpen) setCostDropOpen(true) }}
                  onFocus={() => setCostDropOpen(true)}
                  style={{ paddingLeft: 32, background: 'var(--gray-50)', width: 280 }}
                  autoComplete="off"
                />
                {costDropOpen && filteredCostProducts.length > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 440, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '8px 14px 6px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Service</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>SKU</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Price</span>
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                      {filteredCostProducts.map(p => (
                        <div
                          key={p.id}
                          className="fp-item"
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', alignItems: 'center', gap: 8 }}
                          onMouseDown={e => { e.preventDefault(); addCostLine(p) }}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{p.name}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-400)' }}>{p.sku ?? '—'}</span>
                          <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>{p.cost_price ? `$${p.cost_price.toFixed(2)}` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--gray-100)' }}>
            <div style={{ minWidth: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              {/* Order-level discount */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--gray-400)' }} onClick={e => e.stopPropagation()}>
                <span>Order Discount</span>
                {editable ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={orderDiscount || ''}
                      onChange={e => setOrderDiscount(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      style={{ width: 70, textAlign: 'right', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '3px 7px', fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--slate)', background: 'var(--white)', outline: 'none' }}
                    />
                    <button
                      onClick={() => setOrderDiscountType(t => t === '%' ? '$' : '%')}
                      style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid var(--gray-200)', background: 'var(--gray-50)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Toggle discount type"
                    >{orderDiscountType}</button>
                    {orderDiscountAmount > 0 && (
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--danger)', minWidth: 60, textAlign: 'right' }}>−{fmtMoney(orderDiscountAmount)}</span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: orderDiscountAmount > 0 ? 'var(--danger)' : 'var(--slate)' }}>
                    {orderDiscountAmount > 0 ? `−${fmtMoney(orderDiscountAmount)}` : '—'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-400)' }}>
                <span>Tax</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(gstTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--slate)', letterSpacing: '-0.02em', paddingTop: 6, borderTop: '2px solid var(--slate)' }}>
                <span>Total</span>
                <span>{fmtMoney(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <button onClick={() => router.push('/purchases')} className="btn btn-outline" style={{ height: 38 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {isReadOnly ? 'Close' : 'Cancel'}
        </button>

        {isDraft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Draft')} disabled={saving}>
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', fontSize: 14 }} onClick={() => save('Open')} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Submitting…' : 'Submit Order'}
            </button>
          </div>
        )}

        {isOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-outline" style={{ height: 38 }} onClick={() => save('Open')} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              className="btn btn-primary"
              style={{ height: 38, padding: '0 20px', fontSize: 14 }}
              onClick={() => router.push(`/purchases/${order.id}/receive`)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4"/><polyline points="17 9 12 14 7 9"/><line x1="12" y1="14" x2="12" y2="3"/></svg>
              Receive Stock
            </button>
          </div>
        )}

        {isReadOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* no edit actions for closed/cancelled/partially received */}
          </div>
        )}
      </div>
    </div>
  )
}
