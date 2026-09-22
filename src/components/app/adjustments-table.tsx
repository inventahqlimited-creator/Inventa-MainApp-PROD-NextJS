'use client'
// src/components/app/adjustments-table.tsx

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import StockTickModal from './stock-tick-modal'

type Adjustment = {
  id: string
  adj_number: string | null
  location_id: string | null
  location_name: string | null
  status: string
  adjustment_date: string | null
  reason: string | null
  notes: string | null
}

type Location = { id: string; name: string }

type Product = {
  id: string
  name: string
  sku: string | null
  sell_uom: string | null
  track_stock: boolean | null
  serial_tracking: boolean | null
  batch_tracking: boolean | null
  expiry_tracking: boolean | null
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft">{status}</span>
  if (s === 'completed') return <span className="badge badge-closed">{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled">{status}</span>
  return <span className="badge badge-draft">{status}</span>
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

type Tab = typeof TABS[number]['key']

const REASONS = ['Stocktake', 'Damaged', 'Expired', 'Found', 'Lost', 'Theft', 'Sample', 'Write-off', 'Other']

export default function AdjustmentsTable({
  adjustments,
  locations,
  orgId,
  products,
}: {
  adjustments: Adjustment[]
  locations: Location[]
  orgId: string
  products: Product[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [locFilter, setLocFilter] = useState('')
  const [reasonFilter, setReasonFilter] = useState('')
  const [locOpen, setLocOpen] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [showStockTick, setShowStockTick] = useState(false)

  const filtered = useMemo(() => {
    return adjustments.filter(a => {
      if (tab !== 'all' && a.status.toLowerCase() !== tab) return false
      if (locFilter && a.location_id !== locFilter) return false
      if (reasonFilter && a.reason !== reasonFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (a.adj_number ?? '').toLowerCase().includes(q) ||
          (a.location_name ?? '').toLowerCase().includes(q) ||
          (a.reason ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [adjustments, tab, search, locFilter, reasonFilter])

  const counts = useMemo(() => ({
    all: adjustments.length,
    draft: adjustments.filter(a => a.status.toLowerCase() === 'draft').length,
    completed: adjustments.filter(a => a.status.toLowerCase() === 'completed').length,
    cancelled: adjustments.filter(a => a.status.toLowerCase() === 'cancelled').length,
  }), [adjustments])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)
  const locName = locations.find(l => l.id === locFilter)?.name ?? 'All Locations'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setLocOpen(false); setReasonOpen(false) }}>

      <div className="page-header-card">
        <div className="page-header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/products')} className="sq-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <div className="page-title">Stock Adjustments</div>
              <div className="page-subtitle">Stocktake and manual inventory corrections</div>
            </div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-outline" onClick={() => setShowStockTick(true)}>
              Stock Tick
            </button>
            <button className="btn btn-primary" onClick={() => router.push('/products/adjustments/new')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Adjustment
            </button>
          </div>
        </div>
        <div className="tab-bar">
          {TABS.map(t => (
            <div key={t.key} className={`tab-item${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setPage(1) }}>
              {t.label}<span className="tab-count">{counts[t.key]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search order #, location, reason…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${locFilter ? ' active-filter' : ''}`} onClick={() => { setLocOpen(o => !o); setReasonOpen(false) }}>
            <span>{locName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {locOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">Location</div>
              <div className={`fp-item${!locFilter ? ' active' : ''}`} onClick={() => { setLocFilter(''); setLocOpen(false); setPage(1) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${locFilter === l.id ? ' active' : ''}`} onClick={() => { setLocFilter(l.id); setLocOpen(false); setPage(1) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${reasonFilter ? ' active-filter' : ''}`} onClick={() => { setReasonOpen(o => !o); setLocOpen(false) }}>
            <span>{reasonFilter || 'All Reasons'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {reasonOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 180 }}>
              <div className="col-dropdown-title">Reason</div>
              <div className={`fp-item${!reasonFilter ? ' active' : ''}`} onClick={() => { setReasonFilter(''); setReasonOpen(false); setPage(1) }}>All Reasons</div>
              {REASONS.map(r => (
                <div key={r} className={`fp-item${reasonFilter === r ? ' active' : ''}`} onClick={() => { setReasonFilter(r); setReasonOpen(false); setPage(1) }}>{r}</div>
              ))}
            </div>
          )}
        </div>

        <div className="filter-spacer" />
        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}><strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> adjustments</span>
      </div>

      <div className="table-container">
        <div className="table-toolbar">
          <span className="table-count"><strong>{filtered.length}</strong> adjustments</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Location</th>
                <th>Reason</th>
                <th>Status</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No adjustments match your search.' : 'No adjustments yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(a => (
                <tr key={a.id} onClick={() => router.push(`/products/adjustments/${a.id}`)}>
                  <td><span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>{a.adj_number ?? '—'}</span></td>
                  <td className="td-muted">{fmtDate(a.adjustment_date)}</td>
                  <td><span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{a.location_name ?? '—'}</span></td>
                  <td className="td-muted">{a.reason ?? '—'}</td>
                  <td>{statusBadge(a.status)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); router.push(`/products/adjustments/${a.id}`) }} title="View">
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

      {/* Stock Tick Modal */}
      {showStockTick && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowStockTick(false) }}>
          <div className="modal-box" style={{ maxWidth: 500 }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Stock Tick</div>
                <div className="modal-subtitle">Download your current stock, update quantities, and re-import.</div>
              </div>
              <button className="modal-close" onClick={() => setShowStockTick(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <StockTickModal
              orgId={orgId}
              products={products}
              locations={locations}
              onClose={() => setShowStockTick(false)}
              onImported={() => {
                setShowStockTick(false)
                router.refresh()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
