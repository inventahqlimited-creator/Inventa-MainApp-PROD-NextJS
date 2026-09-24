'use client'
// src/components/app/movements-table.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

type Product = {
  id: string
  name: string
  sku: string | null
}

type Location = {
  id: string
  name: string
}

type Movement = {
  id: string
  created_at: string
  movement_type: string
  qty: number
  unit_cost: number | null
  unit_price: number | null
  reference_id: string | null
  reference_type: string | null
  note: string | null
  created_by: string | null
  location_id: string | null
  product_id: string
  // joined
  product_name?: string | null
  product_sku?: string | null
  location_name?: string | null
  serial_number?: string | null
  batch_number?: string | null
  expiry_date?: string | null
  reference_number?: string | null
}

type SearchMode = 'product' | 'serial' | 'batch'

const TYPE_LABELS: Record<string, string> = {
  purchase:      'Purchase',
  sale:          'Sale',
  transfer_in:   'Transfer In',
  transfer_out:  'Transfer Out',
  adjustment:    'Adjustment',
  return:        'Return',
}

const TYPE_COLORS: Record<string, string> = {
  purchase:      'background:#DBEAFE;color:#1E40AF',
  sale:          'background:#D1FAE5;color:#065F46',
  transfer_in:   'background:#EDE9FE;color:#5B21B6',
  transfer_out:  'background:#FEF3C7;color:#92400E',
  adjustment:    'background:#FEF3C7;color:#92400E',
  return:        'background:#FEE2E2;color:#991B1B',
}

const TYPE_NAV: Record<string, string> = {
  purchase:     '/products/purchases',
  sale:         '/sales',
  transfer_in:  '/products/transfers',
  transfer_out: '/products/transfers',
  adjustment:   '/products/adjustments',
  return:       '/sales',
}

// Short human-readable reference label
function fmtRef(referenceId: string | null, referenceType: string | null, referenceNumber?: string | null): string {
  if (!referenceId) return '—'
  // Prefer the stored human number (e.g. ADJ-0024) from the DB
  if (referenceNumber) return referenceNumber
  // Fallback: prefix + last 6 chars of UUID
  const short = referenceId.replace(/-/g, '').slice(-6).toUpperCase()
  const prefix =
    referenceType === 'purchase_order'   ? 'PO' :
    referenceType === 'sale_order'       ? 'SO' :
    referenceType === 'transfer_order'   ? 'TR' :
    referenceType === 'adjustment_order' ? 'ADJ' :
    referenceType === 'return'           ? 'RET' : '#'
  return `${prefix}-${short}`
}

function typeColorToStyle(s: string): React.CSSProperties {
  const obj: Record<string, string> = {}
  s.split(';').filter(Boolean).forEach(part => {
    const idx = part.indexOf(':')
    if (idx < 0) return
    const key = part.slice(0, idx).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    obj[key] = part.slice(idx + 1).trim()
  })
  return obj as React.CSSProperties
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MovementsTable({
  orgId,
  products,
  locations,
}: {
  orgId: string
  products: Product[]
  locations: Location[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── Read initial state from URL ─────────────────────────────
  const initMode      = (searchParams.get('mode') as SearchMode) || 'product'
  const initProductIds = searchParams.getAll('pid')
  const initSerial    = searchParams.get('serial') || ''
  const initBatch     = searchParams.get('batch')  || ''
  const initDateFrom  = searchParams.get('from')   || ''
  const initDateTo    = searchParams.get('to')     || ''
  const initType      = searchParams.get('type')   || ''
  const initLoc       = searchParams.get('loc')    || ''

  const initSelectedProducts = initProductIds
    .map(id => products.find(p => p.id === id))
    .filter(Boolean) as Product[]

  // ── State ────────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState<SearchMode>(initMode)

  const [productInput, setProductInput]   = useState('')
  const [productSugg, setProductSugg]     = useState<Product[]>([])
  const [showProductSugg, setShowProductSugg] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Product[]>(initSelectedProducts)
  const productInputRef = useRef<HTMLInputElement>(null)

  const [serialInput, setSerialInput] = useState(initSerial)
  const [batchInput, setBatchInput]   = useState(initBatch)

  const [dateFrom, setDateFrom]   = useState(initDateFrom)
  const [dateTo, setDateTo]       = useState(initDateTo)
  const [typeFilter, setTypeFilter] = useState(initType)
  const [locFilter, setLocFilter]   = useState(initLoc)

  const [typeOpen, setTypeOpen]         = useState(false)
  const [locOpen, setLocOpen]           = useState(false)
  const [dateFromOpen, setDateFromOpen] = useState(false)
  const [dateToOpen, setDateToOpen]     = useState(false)

  const [movements, setMovements]           = useState<Movement[]>([])
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(false)
  const [searchedLabel, setSearchedLabel] = useState('')

  const [page, setPage]     = useState(1)
  const [perPage, setPerPage] = useState(50)

  // ── Sync state → URL (replace, not push, so back goes to previous page) ──
  const pushUrl = useCallback((
    mode: SearchMode,
    pids: string[],
    serial: string,
    batch: string,
    from: string,
    to: string,
    type: string,
    loc: string,
  ) => {
    const p = new URLSearchParams()
    p.set('mode', mode)
    pids.forEach(id => p.append('pid', id))
    if (serial) p.set('serial', serial)
    if (batch)  p.set('batch', batch)
    if (from)   p.set('from', from)
    if (to)     p.set('to', to)
    if (type)   p.set('type', type)
    if (loc)    p.set('loc', loc)
    router.replace(`${pathname}?${p.toString()}`)
  }, [router, pathname])

  // ── Core search ──────────────────────────────────────────────
  const doSearch = useCallback(async (opts?: {
    mode?: SearchMode
    products?: Product[]
    serial?: string
    batch?: string
    from?: string
    to?: string
    type?: string
    loc?: string
  }) => {
    const mode    = opts?.mode     ?? searchMode
    const prods   = opts?.products ?? selectedProducts
    const serial  = opts?.serial   ?? serialInput
    const batch   = opts?.batch    ?? batchInput
    const from    = opts?.from     ?? dateFrom
    const to      = opts?.to       ?? dateTo
    const type    = opts?.type     ?? typeFilter
    const loc     = opts?.loc      ?? locFilter

    const params = new URLSearchParams()

    if (mode === 'product') {
      if (prods.length === 0) return
      prods.forEach(p => params.append('product_id', p.id))
      setSearchedLabel(prods.length === 1 ? prods[0].name : `${prods.length} products`)
    } else if (mode === 'serial') {
      const s = serial.trim()
      if (!s) return
      params.set('serial_number', s)
      setSearchedLabel(`Serial: ${s}`)
    } else {
      const b = batch.trim()
      if (!b) return
      params.set('batch_number', b)
      setSearchedLabel(`Batch: ${b}`)
    }

    if (from) params.set('date_from', from)
    if (to)   params.set('date_to', to)
    if (type) params.set('type', type)
    if (loc)  params.set('location_id', loc)

    // Sync to URL
    pushUrl(mode, prods.map(p => p.id), serial, batch, from, to, type, loc)

    setLoading(true)
    setLoaded(false)
    setMovements([])
    setMatchedProducts([])
    setPage(1)

    const res = await fetch(`/api/org/movements?${params}`)
    if (res.ok) {
      const data = await res.json()
      setMovements(data.movements ?? [])
      setMatchedProducts(data.products ?? [])
    }
    setLoading(false)
    setLoaded(true)
  }, [searchMode, selectedProducts, serialInput, batchInput, dateFrom, dateTo, typeFilter, locFilter, pushUrl])

  // ── Auto-run search on mount if URL has params ───────────────
  useEffect(() => {
    const hasSearch =
      (initMode === 'product' && initSelectedProducts.length > 0) ||
      (initMode === 'serial'  && initSerial) ||
      (initMode === 'batch'   && initBatch)
    if (hasSearch) {
      doSearch({
        mode:     initMode,
        products: initSelectedProducts,
        serial:   initSerial,
        batch:    initBatch,
        from:     initDateFrom,
        to:       initDateTo,
        type:     initType,
        loc:      initLoc,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Product tag logic ────────────────────────────────────────
  function handleProductInput(val: string) {
    setProductInput(val)
    if (!val.trim()) { setProductSugg([]); setShowProductSugg(false); return }
    const q = val.toLowerCase()
    const already = new Set(selectedProducts.map(p => p.id))
    const matches = products.filter(p =>
      !already.has(p.id) && (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      )
    ).slice(0, 10)
    setProductSugg(matches)
    setShowProductSugg(true)
  }

  function addProduct(p: Product) {
    const next = selectedProducts.find(x => x.id === p.id)
      ? selectedProducts
      : [...selectedProducts, p]
    setSelectedProducts(next)
    setProductInput('')
    setProductSugg([])
    setShowProductSugg(false)
    productInputRef.current?.focus()
    doSearch({ products: next })
  }

  function removeProduct(id: string) {
    const next = selectedProducts.filter(p => p.id !== id)
    setSelectedProducts(next)
    if (next.length === 0) {
      setMovements([])
      setLoaded(false)
      setSearchedLabel('')
      pushUrl('product', [], '', '', dateFrom, dateTo, typeFilter, locFilter)
    } else {
      doSearch({ products: next })
    }
  }

  function closeAll() {
    setTypeOpen(false); setLocOpen(false)
    setDateFromOpen(false); setDateToOpen(false)
    setShowProductSugg(false)
  }

  function applyFilters(overrides?: { from?: string; to?: string; type?: string; loc?: string }) {
    closeAll()
    doSearch(overrides)
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setTypeFilter(''); setLocFilter('')
    doSearch({ from: '', to: '', type: '', loc: '' })
  }

  function switchMode(mode: SearchMode) {
    setSearchMode(mode)
    setSelectedProducts([])
    setSerialInput('')
    setBatchInput('')
    setMovements([])
    setMatchedProducts([])
    setLoaded(false)
    setSearchedLabel('')
    setDateFrom(''); setDateTo(''); setTypeFilter(''); setLocFilter('')
    pushUrl(mode, [], '', '', '', '', '', '')
  }

  function exportCsv() {
    const showSerial = movements.some(m => m.serial_number)
    const showBatch  = movements.some(m => m.batch_number)
    const headers = ['Date', 'Order Type', 'Order #', 'Product Name', 'SKU', 'Location',
      ...(showSerial ? ['Serial Number'] : []),
      ...(showBatch  ? ['Batch Number']  : []),
      'Qty', 'Note']
    const rows = movements.map(m => [
      fmtDate(m.created_at),
      TYPE_LABELS[m.movement_type] ?? m.movement_type,
      fmtRef(m.reference_id, m.reference_type, m.reference_number),
      m.product_name ?? '',
      m.product_sku  ?? '',
      m.location_name ?? '—',
      ...(showSerial ? [m.serial_number ?? '—'] : []),
      ...(showBatch  ? [m.batch_number  ?? '—'] : []),
      m.qty > 0 ? `+${m.qty}` : String(m.qty),
      m.note ?? '—',
    ])
    const esc = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const totalPages = Math.max(1, Math.ceil(movements.length / perPage))
  const paginated  = movements.slice((page - 1) * perPage, page * perPage)

  const locName  = locations.find(l => l.id === locFilter)?.name ?? 'All Locations'
  const typeName = typeFilter ? (TYPE_LABELS[typeFilter] ?? typeFilter) : 'All Types'
  const hasFilters = !!(dateFrom || dateTo || typeFilter || locFilter)

  const dateFromLabel = dateFrom
    ? new Date(dateFrom).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'From date'
  const dateToLabel = dateTo
    ? new Date(dateTo).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'To date'

  const showSerial   = movements.some(m => m.serial_number)
  const showBatch    = movements.some(m => m.batch_number)
  const multiProduct = loaded && matchedProducts.length > 1
  const colSpan      = 8 + (showSerial ? 1 : 0) + (showBatch ? 1 : 0) + (multiProduct ? 0 : -1) // product col always shown

  const subtitle = loaded
    ? `${searchedLabel} · ${movements.length} movement${movements.length !== 1 ? 's' : ''}`
    : 'Search by product, serial number, or batch number'

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
      onClick={closeAll}
    >
      {/* Header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/products')} className="sq-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <div className="page-title">Stock Movements</div>
              <div className="page-subtitle">{subtitle}</div>
            </div>
          </div>
          <div className="page-header-actions">
            {loaded && movements.length > 0 && (
              <button className="btn btn-outline" onClick={exportCsv}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="filter-bar-card" onClick={e => e.stopPropagation()} style={{ flexWrap: 'wrap', gap: 8 }}>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
          {(['product', 'serial', 'batch'] as SearchMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              style={{
                height: 30, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-ui)',
                background: searchMode === mode ? 'var(--white)' : 'transparent',
                color: searchMode === mode ? 'var(--slate)' : 'var(--gray-400)',
                boxShadow: searchMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all .15s',
              }}
            >
              {mode === 'product' ? 'Product' : mode === 'serial' ? 'Serial No.' : 'Batch No.'}
            </button>
          ))}
        </div>

        {/* Search input */}
        {searchMode === 'product' ? (
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <div
              style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
                minHeight: 36, padding: '4px 10px', border: '1.5px solid var(--gray-200)',
                borderRadius: 10, background: 'var(--white)', cursor: 'text',
              }}
              onClick={() => productInputRef.current?.focus()}
            >
              <svg style={{ color: 'var(--gray-400)', flexShrink: 0 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              {selectedProducts.map(p => (
                <span key={p.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#EDE9FE', color: '#5B21B6',
                  borderRadius: 6, padding: '2px 6px 2px 8px', fontSize: 12, fontWeight: 600,
                }}>
                  {p.name}
                  <button
                    onClick={e => { e.stopPropagation(); removeProduct(p.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#7C3AED', lineHeight: 1, display: 'flex' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </span>
              ))}
              <input
                ref={productInputRef}
                value={productInput}
                onChange={e => handleProductInput(e.target.value)}
                onFocus={() => { if (productSugg.length) setShowProductSugg(true) }}
                placeholder={selectedProducts.length === 0 ? 'Search products…' : 'Add another product…'}
                autoComplete="off"
                style={{
                  flex: 1, minWidth: 140, border: 'none', outline: 'none',
                  fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--slate)',
                  background: 'transparent',
                }}
              />
            </div>
            {showProductSugg && productSugg.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 240, overflowY: 'auto', padding: 6, minWidth: 320 }}>
                {productSugg.map(p => (
                  <div key={p.id} onMouseDown={() => addProduct(p)} className="gs-item"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B21B6" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{p.name}</div>
                      {p.sku && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{p.sku}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showProductSugg && productSugg.length === 0 && productInput.trim() && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', zIndex: 20, padding: '14px', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>
                No products found
              </div>
            )}
          </div>
        ) : searchMode === 'serial' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 260 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="filter-search" style={{ paddingLeft: 32, width: '100%' }}
                placeholder="Enter serial number…"
                value={serialInput}
                onChange={e => setSerialInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-primary" style={{ height: 36, paddingLeft: 16, paddingRight: 16, flexShrink: 0 }}
              onClick={() => doSearch()} disabled={!serialInput.trim()}>
              Search
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 260 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="filter-search" style={{ paddingLeft: 32, width: '100%' }}
                placeholder="Enter batch number…"
                value={batchInput}
                onChange={e => setBatchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-primary" style={{ height: 36, paddingLeft: 16, paddingRight: 16, flexShrink: 0 }}
              onClick={() => doSearch()} disabled={!batchInput.trim()}>
              Search
            </button>
          </div>
        )}

        {/* Date From */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${dateFrom ? ' active-filter' : ''}`} style={{ minWidth: 130 }}
            onClick={e => { e.stopPropagation(); setDateFromOpen(o => !o); setDateToOpen(false); setTypeOpen(false); setLocOpen(false) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>{dateFromLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {dateFromOpen && (
            <div className="inv-dropdown" style={{ display: 'block', padding: 12, minWidth: 200 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title" style={{ marginBottom: 8 }}>From Date</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ height: 34, width: '100%', padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--slate)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => { setDateFrom(''); setDateFromOpen(false); applyFilters({ from: '' }) }}>Clear</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => applyFilters({ from: dateFrom })}>Apply</button>
              </div>
            </div>
          )}
        </div>

        <span style={{ color: 'var(--gray-400)', fontSize: 12, fontFamily: 'var(--font-ui)' }}>to</span>

        {/* Date To */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${dateTo ? ' active-filter' : ''}`} style={{ minWidth: 130 }}
            onClick={e => { e.stopPropagation(); setDateToOpen(o => !o); setDateFromOpen(false); setTypeOpen(false); setLocOpen(false) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>{dateToLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {dateToOpen && (
            <div className="inv-dropdown" style={{ display: 'block', padding: 12, minWidth: 200 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title" style={{ marginBottom: 8 }}>To Date</div>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ height: 34, width: '100%', padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--slate)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => { setDateTo(''); setDateToOpen(false); applyFilters({ to: '' }) }}>Clear</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => applyFilters({ to: dateTo })}>Apply</button>
              </div>
            </div>
          )}
        </div>

        {/* Order Type */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${typeFilter ? ' active-filter' : ''}`}
            onClick={e => { e.stopPropagation(); setTypeOpen(o => !o); setLocOpen(false); setDateFromOpen(false); setDateToOpen(false) }}>
            <span>{typeName}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Order Type</div>
              {[['', 'All Types'], ['purchase', 'Purchase'], ['sale', 'Sale'], ['transfer_in', 'Transfer In'], ['transfer_out', 'Transfer Out'], ['adjustment', 'Adjustment'], ['return', 'Return']].map(([val, label]) => (
                <div key={val} className={`fp-item${typeFilter === val ? ' active' : ''}`}
                  onClick={() => { setTypeFilter(val); setTypeOpen(false); applyFilters({ type: val }) }}>{label}</div>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${locFilter ? ' active-filter' : ''}`}
            onClick={e => { e.stopPropagation(); setLocOpen(o => !o); setTypeOpen(false); setDateFromOpen(false); setDateToOpen(false) }}>
            <span>{locName}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {locOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 190 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Location</div>
              <div className={`fp-item${!locFilter ? ' active' : ''}`}
                onClick={() => { setLocFilter(''); setLocOpen(false); applyFilters({ loc: '' }) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${locFilter === l.id ? ' active' : ''}`}
                  onClick={() => { setLocFilter(l.id); setLocOpen(false); applyFilters({ loc: l.id }) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        {hasFilters && (
          <button className="filter-btn" onClick={clearFilters}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear filters
          </button>
        )}

        <div className="filter-spacer" />
        {loaded && (
          <span style={{ fontSize: 13, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
            <strong style={{ color: 'var(--slate)' }}>{movements.length}</strong> movements
          </span>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>

            {!loading && !loaded && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: 48 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                  {searchMode === 'product' ? 'Search for a product' : searchMode === 'serial' ? 'Enter a serial number' : 'Enter a batch number'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
                  {searchMode === 'product'
                    ? 'Add one or more products above to see their full movement history — purchases, sales, transfers and adjustments all in one view.'
                    : searchMode === 'serial'
                    ? 'Enter a serial number to find which product it belongs to and see every transaction it has appeared in.'
                    : "Enter a batch number to see all products that share that batch and every transaction they've been part of."}
                </div>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
                <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>
              </div>
            )}

            {!loading && loaded && (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th className="li-th" style={{ width: 110, paddingLeft: 24 }}>Date</th>
                    <th className="li-th" style={{ width: 130 }}>Order Type</th>
                    <th className="li-th" style={{ width: 110 }}>Order #</th>
                    <th className="li-th">Product</th>
                    <th className="li-th" style={{ width: 100 }}>SKU</th>
                    <th className="li-th" style={{ width: 150 }}>Location</th>
                    {showSerial && <th className="li-th" style={{ width: 130 }}>Serial No.</th>}
                    {showBatch  && <th className="li-th" style={{ width: 130 }}>Batch No.</th>}
                    <th className="li-th" style={{ width: 110 }}>Note</th>
                    <th className="li-th" style={{ width: 72, textAlign: 'right', paddingRight: 24 }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                        No movements found.
                      </td>
                    </tr>
                  )}
                  {paginated.map(m => {
                    const typeLabel = TYPE_LABELS[m.movement_type] ?? m.movement_type
                    const typeColor = TYPE_COLORS[m.movement_type] ?? 'background:var(--gray-100);color:var(--gray-400)'
                    const navPath   = TYPE_NAV[m.movement_type] ?? '/products'
                    const refLabel  = fmtRef(m.reference_id, m.reference_type, m.reference_number)
                    return (
                      <tr key={m.id} className="li-row">
                        <td className="li-td td-muted" style={{ fontSize: 12, paddingLeft: 24 }}>{fmtDate(m.created_at)}</td>
                        <td className="li-td">
                          <span className="badge" style={typeColorToStyle(typeColor)}>{typeLabel}</span>
                        </td>
                        <td className="li-td">
                          {m.reference_id ? (
                            <a
                              href={`${navPath}/${m.reference_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--teal)', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-ui)', letterSpacing: '0.03em', textDecoration: 'none', cursor: 'pointer' }}
                            >
                              {refLabel}
                            </a>
                          ) : <span className="td-muted">—</span>}
                        </td>
                        <td className="li-td" style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{m.product_name ?? '—'}</td>
                        <td className="li-td td-muted" style={{ fontSize: 12 }}>{m.product_sku || '—'}</td>
                        <td className="li-td td-muted" style={{ fontSize: 12.5 }}>{m.location_name ?? '—'}</td>
                        {showSerial && <td className="li-td td-muted" style={{ fontSize: 12 }}>{m.serial_number || '—'}</td>}
                        {showBatch  && <td className="li-td td-muted" style={{ fontSize: 12 }}>{m.batch_number  || '—'}</td>}
                        <td className="li-td td-muted" style={{ fontSize: 12, maxWidth: 140 }}>
                          <span title={m.note ?? ''} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{m.note || '—'}</span>
                        </td>
                        <td className="li-td" style={{ textAlign: 'right', paddingRight: 24, fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-display)', color: m.qty < 0 ? 'var(--danger)' : m.qty > 0 ? 'var(--teal)' : 'var(--slate)' }}>
                          {m.qty > 0 ? '+' : ''}{m.qty}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {!loading && loaded && movements.length > 0 && (
            <div className="table-footer">
              <div className="footer-left">
                <span className="per-page-label">Rows per page</span>
                <select className="per-page-select" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}>
                  {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i
                  return <button key={p} className={`page-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                })}
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .gs-item:hover { background: var(--gray-50); }
        .li-th { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gray-400); padding: 10px 12px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--gray-100); font-family: var(--font-ui); }
        .li-td { padding: 11px 12px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
        .li-row:hover td { background: var(--gray-50); }
        .td-muted { color: var(--gray-400); font-size: 13px; }
      `}</style>
    </div>
  )
}
