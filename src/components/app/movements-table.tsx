'use client'
// src/components/app/movements-table.tsx

import React, { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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
  // joined
  product_name?: string
  product_sku?: string
  location_name?: string
}

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  adjustment: 'Adjustment',
  return: 'Return',
}

const TYPE_COLORS: Record<string, string> = {
  purchase: 'background:#DBEAFE;color:#1E40AF',
  sale: 'background:#D1FAE5;color:#065F46',
  transfer_in: 'background:#EDE9FE;color:#5B21B6',
  transfer_out: 'background:#FEF3C7;color:#92400E',
  adjustment: 'background:#FEF3C7;color:#92400E',
  return: 'background:#FEE2E2;color:#991B1B',
}

const TYPE_NAV: Record<string, string> = {
  purchase: '/products/purchases',
  sale: '/sales',
  transfer_in: '/products/transfers',
  transfer_out: '/products/transfers',
  adjustment: '/products/adjustments',
  return: '/sales',
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

  // Product search
  const [searchVal, setSearchVal] = useState('')
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [showSugg, setShowSugg] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [locOpen, setLocOpen] = useState(false)
  const [dateFromOpen, setDateFromOpen] = useState(false)
  const [dateToOpen, setDateToOpen] = useState(false)

  // Results
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  function handleSearchInput(val: string) {
    setSearchVal(val)
    if (!val.trim()) {
      setSuggestions([])
      setShowSugg(false)
      setSelectedProduct(null)
      setMovements([])
      setLoaded(false)
      return
    }
    const q = val.toLowerCase()
    const matches = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q)
    ).slice(0, 10)
    setSuggestions(matches)
    setShowSugg(true)
  }

  async function selectProduct(p: Product) {
    setSelectedProduct(p)
    setSearchVal(p.name)
    setSuggestions([])
    setShowSugg(false)
    await loadMovements(p.id)
  }

  const loadMovements = useCallback(async (productId: string) => {
    setLoading(true)
    setLoaded(false)

    const params = new URLSearchParams({ product_id: productId })
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (typeFilter) params.set('type', typeFilter)
    if (locFilter) params.set('location_id', locFilter)

    const res = await fetch(`/api/org/movements?${params}`)
    if (res.ok) {
      const data = await res.json()
      setMovements(data.movements ?? [])
    }
    setLoading(false)
    setLoaded(true)
    setPage(1)
  }, [dateFrom, dateTo, typeFilter, locFilter])

  async function applyFilters() {
    if (selectedProduct) await loadMovements(selectedProduct.id)
    setTypeOpen(false)
    setLocOpen(false)
    setDateFromOpen(false)
    setDateToOpen(false)
  }

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setTypeFilter('')
    setLocFilter('')
    setTypeOpen(false)
    setLocOpen(false)
  }

  function exportCsv() {
    const headers = ['Date', 'Order Type', 'Order #', 'Product Name', 'SKU', 'Location', 'Qty', 'Note']
    const rows = filtered.map(m => [
      fmtDate(m.created_at),
      TYPE_LABELS[m.movement_type] ?? m.movement_type,
      m.reference_id ?? '—',
      m.product_name ?? '',
      m.product_sku ?? '',
      m.location_name ?? '—',
      String(m.qty),
      m.note ?? '—',
    ])
    const esc = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // Client-side filter after load (type / location already applied server-side but allow re-filter)
  const filtered = movements

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const locName = locations.find(l => l.id === locFilter)?.name ?? 'All Locations'
  const typeName = typeFilter ? (TYPE_LABELS[typeFilter] ?? typeFilter) : 'All Types'

  const dateFromLabel = dateFrom
    ? new Date(dateFrom).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'From date'
  const dateToLabel = dateTo
    ? new Date(dateTo).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'To date'

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
      onClick={() => { setTypeOpen(false); setLocOpen(false); setDateFromOpen(false); setDateToOpen(false) }}
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
              <div className="page-subtitle" id="smSubtitle">
                {selectedProduct && loaded
                  ? `${selectedProduct.name} · ${filtered.length} movement${filtered.length !== 1 ? 's' : ''}`
                  : 'Search for a product to view its movement history'}
              </div>
            </div>
          </div>
          <div className="page-header-actions">
            {loaded && filtered.length > 0 && (
              <button className="btn btn-outline" onClick={exportCsv}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar-card" onClick={e => e.stopPropagation()} style={{ flexWrap: 'wrap', gap: 8 }}>
        {/* Product search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 260, maxWidth: 380 }}>
          <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={searchRef}
            className="filter-search"
            style={{ paddingLeft: 32 }}
            placeholder="Type to search products…"
            value={searchVal}
            onChange={e => handleSearchInput(e.target.value)}
            onFocus={() => { if (suggestions.length) setShowSugg(true) }}
            autoComplete="off"
          />
          {showSugg && suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 240, overflowY: 'auto', padding: 6, minWidth: 320 }}>
              {suggestions.map(p => (
                <div
                  key={p.id}
                  onMouseDown={() => selectProduct(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}
                  className="gs-item"
                >
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
          {showSugg && suggestions.length === 0 && searchVal.trim() && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', zIndex: 20, padding: '14px', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>
              No products found
            </div>
          )}
        </div>

        {/* Date From */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${dateFrom ? ' active-filter' : ''}`}
            style={{ minWidth: 130 }}
            onClick={e => { e.stopPropagation(); setDateFromOpen(o => !o); setDateToOpen(false); setTypeOpen(false); setLocOpen(false) }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>{dateFromLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {dateFromOpen && (
            <div className="inv-dropdown" style={{ display: 'block', padding: 12, minWidth: 200 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title" style={{ marginBottom: 8 }}>From Date</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ height: 34, width: '100%', padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--slate)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => { setDateFrom(''); setDateFromOpen(false); }}>Clear</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => { setDateFromOpen(false); applyFilters() }}>Apply</button>
              </div>
            </div>
          )}
        </div>

        <span style={{ color: 'var(--gray-400)', fontSize: 12, fontFamily: 'var(--font-ui)' }}>to</span>

        {/* Date To */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${dateTo ? ' active-filter' : ''}`}
            style={{ minWidth: 130 }}
            onClick={e => { e.stopPropagation(); setDateToOpen(o => !o); setDateFromOpen(false); setTypeOpen(false); setLocOpen(false) }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>{dateToLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {dateToOpen && (
            <div className="inv-dropdown" style={{ display: 'block', padding: 12, minWidth: 200 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title" style={{ marginBottom: 8 }}>To Date</div>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ height: 34, width: '100%', padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--slate)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => { setDateTo(''); setDateToOpen(false) }}>Clear</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 30, fontSize: 12 }} onClick={() => { setDateToOpen(false); applyFilters() }}>Apply</button>
              </div>
            </div>
          )}
        </div>

        {/* Order Type */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${typeFilter ? ' active-filter' : ''}`}
            onClick={e => { e.stopPropagation(); setTypeOpen(o => !o); setLocOpen(false); setDateFromOpen(false); setDateToOpen(false) }}
          >
            <span>{typeName}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Order Type</div>
              {[['', 'All Types'], ['purchase', 'Purchase'], ['sale', 'Sale'], ['transfer_in', 'Transfer In'], ['transfer_out', 'Transfer Out'], ['adjustment', 'Adjustment'], ['return', 'Return']].map(([val, label]) => (
                <div key={val} className={`fp-item${typeFilter === val ? ' active' : ''}`} onClick={() => { setTypeFilter(val); setTypeOpen(false); if (selectedProduct) setTimeout(() => loadMovements(selectedProduct.id), 0) }}>{label}</div>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${locFilter ? ' active-filter' : ''}`}
            onClick={e => { e.stopPropagation(); setLocOpen(o => !o); setTypeOpen(false); setDateFromOpen(false); setDateToOpen(false) }}
          >
            <span>{locName}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {locOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 190 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Location</div>
              <div className={`fp-item${!locFilter ? ' active' : ''}`} onClick={() => { setLocFilter(''); setLocOpen(false); if (selectedProduct) setTimeout(() => loadMovements(selectedProduct.id), 0) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${locFilter === l.id ? ' active' : ''}`} onClick={() => { setLocFilter(l.id); setLocOpen(false); if (selectedProduct) setTimeout(() => loadMovements(selectedProduct.id), 0) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        {/* Clear */}
        {(dateFrom || dateTo || typeFilter || locFilter) && (
          <button className="filter-btn" onClick={() => { clearFilters(); if (selectedProduct) setTimeout(() => loadMovements(selectedProduct.id), 0) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear
          </button>
        )}

        <div className="filter-spacer" />
        {loaded && (
          <span style={{ fontSize: 13, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
            <strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> movements
          </span>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            {!selectedProduct && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: 48 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>Search for a product</div>
                <div style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
                  Enter a product name or SKU above to view its full movement history.
                </div>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
                <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>
              </div>
            )}

            {!loading && loaded && (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th className="li-th" style={{ width: 110, paddingLeft: 24 }}>Date</th>
                    <th className="li-th" style={{ width: 130 }}>Order Type</th>
                    <th className="li-th" style={{ width: 140 }}>Order #</th>
                    <th className="li-th">Product Name</th>
                    <th className="li-th" style={{ width: 110 }}>SKU</th>
                    <th className="li-th" style={{ width: 160 }}>Location</th>
                    <th className="li-th" style={{ width: 120 }}>Note</th>
                    <th className="li-th" style={{ width: 80, textAlign: 'right', paddingRight: 24 }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                        No movements found for this product.
                      </td>
                    </tr>
                  )}
                  {paginated.map(m => {
                    const typeLabel = TYPE_LABELS[m.movement_type] ?? m.movement_type
                    const typeColor = TYPE_COLORS[m.movement_type] ?? 'background:var(--gray-100);color:var(--gray-400)'
                    const navPath = TYPE_NAV[m.movement_type] ?? '/products'
                    return (
                      <tr key={m.id} className="li-row">
                        <td className="li-td td-muted" style={{ fontSize: 12, paddingLeft: 24 }}>{fmtDate(m.created_at)}</td>
                        <td className="li-td">
                          <span className="badge" style={typeColorToStyle(typeColor)}>{typeLabel}</span>
                        </td>
                        <td className="li-td">
                          {m.reference_id ? (
                            <button
                              onClick={() => router.push(`${navPath}/${m.reference_id}`)}
                              style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                            >
                              {m.reference_id.slice(0, 8)}…
                            </button>
                          ) : <span className="td-muted">—</span>}
                        </td>
                        <td className="li-td" style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{m.product_name ?? '—'}</td>
                        <td className="li-td td-muted" style={{ fontSize: 12 }}>{m.product_sku || '—'}</td>
                        <td className="li-td td-muted" style={{ fontSize: 12.5 }}>{m.location_name ?? '—'}</td>
                        <td className="li-td td-muted" style={{ fontSize: 12, maxWidth: 160 }}>
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

          {/* Footer */}
          {!loading && loaded && filtered.length > 0 && (
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
