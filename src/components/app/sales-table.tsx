'use client'

import { useState, useMemo } from 'react'
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
const PICKING_GROUP = ['picking', 'partially picked', 'picked', 'partially packed', 'packed']
const CLOSED_GROUP = ['closed', 'shipped', 'delivered']

function statusKey(status: string): 'draft' | 'open' | 'picking' | 'closed' | 'cancelled' {
  const s = status.toLowerCase()
  if (OPEN_GROUP.includes(s)) return 'open'
  if (PICKING_GROUP.includes(s)) return 'picking'
  if (CLOSED_GROUP.includes(s)) return 'closed'
  if (s === 'cancelled') return 'cancelled'
  return 'draft'
}

function statusBadge(status: string) {
  switch (statusKey(status)) {
    case 'open': return <span className="badge badge-open">Open</span>
    case 'picking': return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Picking</span>
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
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

// These tabs only appear when at least one order has that status
const HIDE_WHEN_EMPTY = new Set<string>(['draft', 'picking', 'cancelled'])

type Tab = typeof TABS[number]['key']

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
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setCustomerOpen(false); setLocationOpen(false); setActionsOpen(false) }}>

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
          <button className={`filter-dd-btn${customerFilter ? ' active-filter' : ''}`} onClick={() => { setCustomerOpen(o => !o); setLocationOpen(false) }}>
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
          <button className={`filter-dd-btn${locationFilter ? ' active-filter' : ''}`} onClick={() => { setLocationOpen(o => !o); setCustomerOpen(false) }}>
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
                <th>Order #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Status</th>
                <th>Delivery Date</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No orders match your search.' : 'No sales orders yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(o => (
                <tr key={o.id} onClick={() => router.push(`/sales/${o.id}`)}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>{o.so_number ?? '—'}</span>
                    {o.ref && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{o.ref}</div>}
                  </td>
                  <td className="td-muted">{fmtDate(o.order_date)}</td>
                  <td><span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{o.customer_name ?? '—'}</span></td>
                  <td className="td-muted">{o.location_name ?? '—'}</td>
                  <td>{statusBadge(o.status)}</td>
                  <td>
                    <span style={{ color: isOverdue(o) ? 'var(--danger)' : 'var(--gray-400)', fontSize: 13, fontWeight: isOverdue(o) ? 600 : 400 }}>
                      {fmtDate(o.expected_date)}{isOverdue(o) ? ' ⚠' : ''}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{fmtMoney(o.total_amount)}</td>
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
