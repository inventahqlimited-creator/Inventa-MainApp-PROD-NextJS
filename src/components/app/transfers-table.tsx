'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Transfer = {
  id: string
  tr_number: string | null
  from_location_id: string | null
  to_location_id: string | null
  from_location_name: string | null
  to_location_name: string | null
  status: string
  transfer_date: string | null
  expected_date: string | null
  notes: string | null
}

type Location = { id: string; name: string }

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft">{status}</span>
  if (s === 'in transit') return <span className="badge badge-open">{status}</span>
  if (s === 'completed') return <span className="badge badge-closed">{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled">{status}</span>
  return <span className="badge badge-draft">{status}</span>
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'in transit', label: 'In Transit' },
  { key: 'completed', label: 'Completed' },
] as const

type Tab = typeof TABS[number]['key']

export default function TransfersTable({
  transfers,
  locations,
  orgId,
}: {
  transfers: Transfer[]
  locations: Location[]
  orgId: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  const filtered = useMemo(() => {
    return transfers.filter(t => {
      if (tab !== 'all' && t.status.toLowerCase() !== tab) return false
      if (fromFilter && t.from_location_id !== fromFilter) return false
      if (toFilter && t.to_location_id !== toFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (t.tr_number ?? '').toLowerCase().includes(q) ||
          (t.from_location_name ?? '').toLowerCase().includes(q) ||
          (t.to_location_name ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [transfers, tab, search, fromFilter, toFilter])

  const counts = useMemo(() => ({
    all: transfers.length,
    draft: transfers.filter(t => t.status.toLowerCase() === 'draft').length,
    'in transit': transfers.filter(t => t.status.toLowerCase() === 'in transit').length,
    completed: transfers.filter(t => t.status.toLowerCase() === 'completed').length,
  }), [transfers])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const fromName = locations.find(l => l.id === fromFilter)?.name ?? 'All Locations'
  const toName = locations.find(l => l.id === toFilter)?.name ?? 'All Locations'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setFromOpen(false); setToOpen(false) }}>

      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Transfers</div>
            <div className="page-subtitle">Stock transfers between locations</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => router.push('/transfers/new')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Transfer
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
          <input className="filter-search" placeholder="Search transfer #, location…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${fromFilter ? ' active-filter' : ''}`} onClick={() => { setFromOpen(o => !o); setToOpen(false) }}>
            <span>From: {fromName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {fromOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">From Location</div>
              <div className={`fp-item${!fromFilter ? ' active' : ''}`} onClick={() => { setFromFilter(''); setFromOpen(false); setPage(1) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${fromFilter === l.id ? ' active' : ''}`} onClick={() => { setFromFilter(l.id); setFromOpen(false); setPage(1) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${toFilter ? ' active-filter' : ''}`} onClick={() => { setToOpen(o => !o); setFromOpen(false) }}>
            <span>To: {toName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {toOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">To Location</div>
              <div className={`fp-item${!toFilter ? ' active' : ''}`} onClick={() => { setToFilter(''); setToOpen(false); setPage(1) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${toFilter === l.id ? ' active' : ''}`} onClick={() => { setToFilter(l.id); setToOpen(false); setPage(1) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        <div className="filter-spacer" />
        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}><strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> transfers</span>
      </div>

      <div className="table-container">
        <div className="table-toolbar">
          <span className="table-count"><strong>{filtered.length}</strong> transfers</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Expected</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No transfers match your search.' : 'No transfers yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(t => (
                <tr key={t.id} onClick={() => router.push(`/transfers/${t.id}`)}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>{t.tr_number ?? '—'}</span>
                  </td>
                  <td className="td-muted">{fmtDate(t.transfer_date)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{t.from_location_name ?? '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{t.to_location_name ?? '—'}</span>
                    </div>
                  </td>
                  <td>{statusBadge(t.status)}</td>
                  <td className="td-muted">{fmtDate(t.expected_date)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); router.push(`/transfers/${t.id}`) }} title="View">
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
