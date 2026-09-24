'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Order = {
  id: string
  po_number: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  total_amount: number | null
  supplier_id: string | null
  supplier_name: string | null
  location_id: string | null
  location_name: string | null
  notes: string | null
  reference: string | null
  terms: string | null
  currency: string | null
}

type Contact = { id: string; name: string }
type Location = { id: string; name: string }

function fmt(n: number | null | undefined) {
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

function isOverdue(expectedDate: string | null, status: string) {
  if (!expectedDate) return false
  if (['closed', 'cancelled'].includes(status.toLowerCase())) return false
  return new Date(expectedDate) < new Date()
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'open', label: 'Open' },
  { key: 'partial', label: 'Partially Received' },
  { key: 'closed', label: 'Closed' },
] as const

type Tab = typeof TABS[number]['key']

// Column definitions
const COLS = [
  { key: 'po_number',     label: 'Order #',       required: true  },
  { key: 'order_date',    label: 'Created',        required: false },
  { key: 'supplier',      label: 'Supplier',       required: false },
  { key: 'location',      label: 'Location',       required: false },
  { key: 'total_amount',  label: 'Total Cost',     required: false },
  { key: 'status',        label: 'Status',         required: false },
  { key: 'expected_date', label: 'Delivery Date',  required: false },
  { key: 'terms',         label: 'Terms',          required: false },
  { key: 'reference',     label: 'Reference',      required: false },
] as const

type ColKey = typeof COLS[number]['key']

const DEFAULT_COLS: ColKey[] = ['po_number', 'order_date', 'supplier', 'location', 'total_amount', 'status', 'expected_date']

const LS_KEY = 'purchases_visible_cols'

function loadCols(): Set<ColKey> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as ColKey[]
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch {}
  return new Set(DEFAULT_COLS)
}

export default function PurchasesTable({
  orders,
  contacts,
  locations,
  orgId,
}: {
  orders: Order[]
  contacts: Contact[]
  locations: Location[]
  orgId: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))

  // Load persisted column visibility on mount
  useEffect(() => {
    setVisibleCols(loadCols())
  }, [])

  function toggleCol(key: ColKey) {
    const col = COLS.find(c => c.key === key)
    if (col?.required) return
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const closeAll = () => {
    setSupplierOpen(false)
    setLocationOpen(false)
    setColOpen(false)
  }

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (tab === 'draft' && o.status.toLowerCase() !== 'draft') return false
      if (tab === 'open' && o.status.toLowerCase() !== 'open') return false
      if (tab === 'partial' && o.status.toLowerCase() !== 'partially received') return false
      if (tab === 'closed' && o.status.toLowerCase() !== 'closed') return false
      if (supplierFilter && o.supplier_id !== supplierFilter) return false
      if (locationFilter && o.location_id !== locationFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (o.po_number ?? '').toLowerCase().includes(q) ||
          (o.supplier_name ?? '').toLowerCase().includes(q) ||
          (o.location_name ?? '').toLowerCase().includes(q) ||
          (o.reference ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [orders, tab, search, supplierFilter, locationFilter])

  const counts = useMemo(() => ({
    all: orders.length,
    draft: orders.filter(o => o.status.toLowerCase() === 'draft').length,
    open: orders.filter(o => o.status.toLowerCase() === 'open').length,
    partial: orders.filter(o => o.status.toLowerCase() === 'partially received').length,
    closed: orders.filter(o => o.status.toLowerCase() === 'closed').length,
  }), [orders])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const supplierName = contacts.find(c => c.id === supplierFilter)?.name ?? 'All Suppliers'
  const locationName = locations.find(l => l.id === locationFilter)?.name ?? 'All Locations'

  // Ordered visible columns for rendering
  const activeCols = COLS.filter(c => visibleCols.has(c.key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={closeAll}>

      {/* Page header */}
      <div className="page-header-card" onClick={e => e.stopPropagation()}>
        <div className="page-header-top">
          <div>
            <div className="page-title">Purchases</div>
            <div className="page-subtitle">Purchase orders from your suppliers</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => router.push('/purchases/new')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Purchase Order
            </button>
          </div>
        </div>
        <div className="tab-bar">
          {TABS.map(t => (
            <div
              key={t.key}
              className={`tab-item${tab === t.key ? ' active' : ''}`}
              onClick={() => { setTab(t.key); setPage(1) }}
            >
              {t.label}
              <span className="tab-count">{counts[t.key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="filter-search"
            placeholder="Search order #, supplier…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        {/* Supplier filter */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${supplierFilter ? ' active-filter' : ''}`}
            onClick={e => { e.stopPropagation(); setSupplierOpen(o => !o); setLocationOpen(false); setColOpen(false) }}
          >
            <span>{supplierName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {supplierOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Supplier</div>
              <div
                className={`fp-item${!supplierFilter ? ' active' : ''}`}
                onClick={() => { setSupplierFilter(''); setSupplierOpen(false); setPage(1) }}
              >
                All Suppliers
              </div>
              {contacts.map(c => (
                <div
                  key={c.id}
                  className={`fp-item${supplierFilter === c.id ? ' active' : ''}`}
                  onClick={() => { setSupplierFilter(c.id); setSupplierOpen(false); setPage(1) }}
                >
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Location filter */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${locationFilter ? ' active-filter' : ''}`}
            onClick={e => { e.stopPropagation(); setLocationOpen(o => !o); setSupplierOpen(false); setColOpen(false) }}
          >
            <span>{locationName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {locationOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Location</div>
              <div
                className={`fp-item${!locationFilter ? ' active' : ''}`}
                onClick={() => { setLocationFilter(''); setLocationOpen(false); setPage(1) }}
              >
                All Locations
              </div>
              {locations.map(l => (
                <div
                  key={l.id}
                  className={`fp-item${locationFilter === l.id ? ' active' : ''}`}
                  onClick={() => { setLocationFilter(l.id); setLocationOpen(false); setPage(1) }}
                >
                  {l.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="filter-spacer" />

        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          <strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> orders
        </span>

        {/* Column selector */}
        <div style={{ position: 'relative' }}>
          <button
            className="filter-dd-btn"
            onClick={e => { e.stopPropagation(); setColOpen(o => !o); setSupplierOpen(false); setLocationOpen(false) }}
            title="Show/hide columns"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Columns</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {colOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 180, right: 0, left: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Columns</div>
              {COLS.map(c => (
                <div
                  key={c.key}
                  className="fp-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: c.required ? 0.5 : 1, cursor: c.required ? 'default' : 'pointer' }}
                  onClick={() => toggleCol(c.key)}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `1.5px solid ${visibleCols.has(c.key) ? 'var(--teal)' : 'var(--gray-300)'}`,
                    background: visibleCols.has(c.key) ? 'var(--teal)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {visibleCols.has(c.key) && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--slate)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {activeCols.map(c => {
                  if (c.key === 'total_amount') return <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>
                  return <th key={c.key}>{c.label}</th>
                })}
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={activeCols.length + 1} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No orders match your search.' : 'No purchase orders yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(o => {
                const overdue = isOverdue(o.expected_date, o.status)
                return (
                  <tr key={o.id} onClick={() => router.push(`/purchases/${o.id}`)}>
                    {activeCols.map(c => {
                      switch (c.key) {
                        case 'po_number':
                          return (
                            <td key={c.key}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>
                                {o.po_number ?? '—'}
                              </span>
                              {o.reference && (
                                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{o.reference}</div>
                              )}
                            </td>
                          )
                        case 'order_date':
                          return <td key={c.key} className="td-muted">{fmtDate(o.order_date)}</td>
                        case 'supplier':
                          return (
                            <td key={c.key}>
                              <span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>
                                {o.supplier_name ?? '—'}
                              </span>
                            </td>
                          )
                        case 'location':
                          return <td key={c.key} className="td-muted">{o.location_name ?? '—'}</td>
                        case 'total_amount':
                          return <td key={c.key} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{fmt(o.total_amount)}</td>
                        case 'status':
                          return <td key={c.key}>{statusBadge(o.status)}</td>
                        case 'expected_date':
                          return (
                            <td key={c.key}>
                              <span style={{ color: overdue ? 'var(--danger)' : 'var(--gray-400)', fontSize: 13, fontWeight: overdue ? 600 : 400 }}>
                                {fmtDate(o.expected_date)}
                                {overdue && ' ⚠'}
                              </span>
                            </td>
                          )
                        case 'terms':
                          return <td key={c.key} className="td-muted">{o.terms ?? '—'}</td>
                        case 'reference':
                          return <td key={c.key} className="td-muted">{o.reference ?? '—'}</td>
                        default:
                          return <td key={c.key}>—</td>
                      }
                    })}
                    <td>
                      <div className="row-actions">
                        <button className="row-action-btn" title="View">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="table-footer">
          <div className="footer-left">
            <span className="per-page-label">Rows per page</span>
            <select
              className="per-page-select"
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="pagination">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i
              return (
                <button key={p} className={`page-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              )
            })}
            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
