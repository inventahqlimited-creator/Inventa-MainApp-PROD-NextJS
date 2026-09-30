'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Order = {
  id: string
  so_number: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  delivery_date: string | null
  total_amount: number | null
  customer_id: string | null
  customer_name: string | null
  location_id: string | null
  location_name: string | null
  notes: string | null
  ref: string | null
  terms: string | null
  currency: string | null
  stock_status?: 'in' | 'no' | null
}

type Contact = { id: string; name: string }
type Location = { id: string; name: string }

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Draft → Open → Picking → Closed (or Cancelled). Older statuses fold in: stock-based ones into Open,
// picked/packed into Picking, shipped/delivered into Closed.
const OPEN_GROUP = ['open', 'no stock', 'stock available', 'partial stock']
const PICKING_GROUP = ['picking', 'partially picked', 'picked', 'partially packed']
const CLOSED_GROUP = ['closed', 'shipped', 'delivered']

function statusKey(status: string): 'draft' | 'open' | 'picking' | 'packed' | 'closed' | 'cancelled' {
  const s = status.toLowerCase()
  if (OPEN_GROUP.includes(s)) return 'open'
  if (PICKING_GROUP.includes(s)) return 'picking'
  if (s === 'packed') return 'packed'
  if (CLOSED_GROUP.includes(s)) return 'closed'
  if (s === 'cancelled') return 'cancelled'
  return 'draft'
}

function statusBadge(status: string) {
  switch (statusKey(status)) {
    case 'open': return <span className="badge badge-open">Open</span>
    case 'picking': return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Picking</span>
    case 'packed': return <span className="badge" style={{ background: '#CCFBF1', color: '#0F766E' }}>Packed</span>
    case 'closed': return <span className="badge badge-closed">Closed</span>
    case 'cancelled': return <span className="badge badge-cancelled">Cancelled</span>
    default: return <span className="badge badge-draft">Draft</span>
  }
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'open', label: 'Open' },
  { key: 'picking', label: 'Picking' },
  { key: 'packed', label: 'Packed' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

// These tabs only appear when at least one order has that status
const HIDE_WHEN_EMPTY = new Set<string>(['draft', 'picking', 'packed', 'cancelled'])

type Tab = typeof TABS[number]['key']

// Column definitions (same idea as Purchases)
const COLS = [
  { key: 'so_number',     label: 'Order #',        required: true  },
  { key: 'order_date',    label: 'Date',           required: false },
  { key: 'customer',      label: 'Customer',       required: false },
  { key: 'location',      label: 'Location',       required: false },
  { key: 'status',        label: 'Status',         required: false },
  { key: 'stock',         label: 'Stock',          required: false },
  { key: 'expected_date', label: 'Delivery Date',  required: false },
  { key: 'terms',         label: 'Terms',          required: false },
  { key: 'ref',           label: 'Customer Order #', required: false },
  { key: 'total_amount',  label: 'Total',          required: false },
] as const

type ColKey = typeof COLS[number]['key']

const DEFAULT_COLS: ColKey[] = ['so_number', 'order_date', 'customer', 'location', 'status', 'stock', 'expected_date', 'total_amount']

const LS_KEY = 'sales_visible_cols'

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

function stockBadge(o: Order) {
  const k = statusKey(o.status)
  if (k === 'closed' || k === 'cancelled' || !o.stock_status) return <span style={{ color: 'var(--gray-300)' }}>—</span>
  return o.stock_status === 'no'
    ? <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C' }}>No Stock</span>
    : <span className="badge" style={{ background: '#DCFCE7', color: '#15803D' }}>In Stock</span>
}

export default function SalesTable({
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
  const [customerFilter, setCustomerFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))

  // Load persisted column visibility on mount
  useEffect(() => { setVisibleCols(loadCols()) }, [])

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

  const activeCols = COLS.filter(c => visibleCols.has(c.key))

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (tab !== 'all' && statusKey(o.status) !== tab) return false
      if (customerFilter && o.customer_id !== customerFilter) return false
      if (locationFilter && o.location_id !== locationFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (o.so_number ?? '').toLowerCase().includes(q) ||
          (o.customer_name ?? '').toLowerCase().includes(q) ||
          (o.ref ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [orders, tab, search, customerFilter, locationFilter])

  const counts = useMemo(() => ({
    all: orders.length,
    draft: orders.filter(o => statusKey(o.status) === 'draft').length,
    open: orders.filter(o => statusKey(o.status) === 'open').length,
    picking: orders.filter(o => statusKey(o.status) === 'picking').length,
    packed: orders.filter(o => statusKey(o.status) === 'packed').length,
    closed: orders.filter(o => statusKey(o.status) === 'closed').length,
    cancelled: orders.filter(o => statusKey(o.status) === 'cancelled').length,
  }), [orders])

  const visibleTabs = TABS.filter(t => !HIDE_WHEN_EMPTY.has(t.key) || counts[t.key] > 0)

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const customerName = contacts.find(c => c.id === customerFilter)?.name ?? 'All Customers'
  const locationName = locations.find(l => l.id === locationFilter)?.name ?? 'All Locations'

  function isOverdue(o: Order) {
    if (!o.expected_date) return false
    if (['closed', 'cancelled'].includes(statusKey(o.status))) return false
    return new Date(o.expected_date) < new Date()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setCustomerOpen(false); setLocationOpen(false); setActionsOpen(false); setColOpen(false) }}>

      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Sales</div>
            <div className="page-subtitle">Sales orders for your customers</div>
          </div>
          <div className="page-header-actions">
            <div style={{ position: 'relative' }}>
              <button className="btn btn-outline" onClick={e => { e.stopPropagation(); setActionsOpen(o => !o) }}>
                Actions
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {actionsOpen && (
                <div className="inv-dropdown" style={{ display: 'block', minWidth: 190, padding: 6 }} onClick={e => e.stopPropagation()}>
                  <div className="dd-item" onClick={() => setActionsOpen(false)}>
                    <div className="dd-icon-wrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
                    Export Orders
                  </div>
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/sales/new')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Sales Order
            </button>
          </div>
        </div>
        <div className="tab-bar">
          {visibleTabs.map(t => (
            <div key={t.key} className={`tab-item${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setPage(1) }}>
              {t.label}<span className="tab-count">{counts[t.key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search order #, customer…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        {/* Customer filter */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${customerFilter ? ' active-filter' : ''}`} onClick={() => { setCustomerOpen(o => !o); setLocationOpen(false); setColOpen(false) }}>
            <span>{customerName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {customerOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">Customer</div>
              <div className={`fp-item${!customerFilter ? ' active' : ''}`} onClick={() => { setCustomerFilter(''); setCustomerOpen(false); setPage(1) }}>All Customers</div>
              {contacts.map(c => (
                <div key={c.id} className={`fp-item${customerFilter === c.id ? ' active' : ''}`} onClick={() => { setCustomerFilter(c.id); setCustomerOpen(false); setPage(1) }}>{c.name}</div>
              ))}
            </div>
          )}
        </div>

        {/* Location filter */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${locationFilter ? ' active-filter' : ''}`} onClick={() => { setLocationOpen(o => !o); setCustomerOpen(false); setColOpen(false) }}>
            <span>{locationName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {locationOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">Location</div>
              <div className={`fp-item${!locationFilter ? ' active' : ''}`} onClick={() => { setLocationFilter(''); setLocationOpen(false); setPage(1) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${locationFilter === l.id ? ' active' : ''}`} onClick={() => { setLocationFilter(l.id); setLocationOpen(false); setPage(1) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        <div className="filter-spacer" />
        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}><strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> orders</span>

        {/* Column selector */}
        <div style={{ position: 'relative' }}>
          <button
            className="filter-dd-btn"
            onClick={e => { e.stopPropagation(); setColOpen(o => !o); setCustomerOpen(false); setLocationOpen(false) }}
            title="Show/hide columns"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Columns</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {colOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 190, right: 0, left: 'auto' }} onClick={e => e.stopPropagation()}>
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
        <div className="table-toolbar">
          <span className="table-count"><strong>{filtered.length}</strong> orders</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {activeCols.map(c => (
                  <th key={c.key} style={c.key === 'total_amount' ? { textAlign: 'right' } : undefined}>{c.label}</th>
                ))}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={activeCols.length + 1} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No orders match your search.' : 'No sales orders yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(o => (
                <tr key={o.id} onClick={() => router.push(`/sales/${o.id}`)}>
                  {activeCols.map(c => {
                    switch (c.key) {
                      case 'so_number': return (
                        <td key={c.key}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>{o.so_number ?? '—'}</span>
                          {o.ref && !visibleCols.has('ref') && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{o.ref}</div>}
                        </td>
                      )
                      case 'order_date': return <td key={c.key} className="td-muted">{fmtDate(o.order_date)}</td>
                      case 'customer': return <td key={c.key}><span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{o.customer_name ?? '—'}</span></td>
                      case 'location': return <td key={c.key} className="td-muted">{o.location_name ?? '—'}</td>
                      case 'status': return <td key={c.key}>{statusBadge(o.status)}</td>
                      case 'stock': return <td key={c.key}>{stockBadge(o)}</td>
                      case 'expected_date': return (
                        <td key={c.key}>
                          <span style={{ color: isOverdue(o) ? 'var(--danger)' : 'var(--gray-400)', fontSize: 13, fontWeight: isOverdue(o) ? 600 : 400 }}>
                            {fmtDate(o.expected_date)}{isOverdue(o) ? ' ⚠' : ''}
                          </span>
                        </td>
                      )
                      case 'terms': return <td key={c.key} className="td-muted">{o.terms ?? '—'}</td>
                      case 'ref': return <td key={c.key} className="td-muted">{o.ref ?? '—'}</td>
                      case 'total_amount': return <td key={c.key} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(o.total_amount)}</td>
                    }
                  })}
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); router.push(`/sales/${o.id}`) }} title="View">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="footer-left">
            <span className="per-page-label">Rows per page</span>
            <select className="per-page-select" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
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
      </div>
    </div>
  )
}
