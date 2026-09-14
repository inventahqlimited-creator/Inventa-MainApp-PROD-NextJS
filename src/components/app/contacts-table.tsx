'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Contact = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  bill_city: string | null
  bill_country: string | null
  currency: string | null
  tier: string | null
  terms: string | null
  tax_rate: string | null
  balance_owing: number | null
  credit_limit: number | null
  disc_type: string | null
  disc_value: number | null
  tax_number: string | null
  is_active: boolean | null
  status: string | null
}

const AVATAR_COLORS = [
  '#0D9488','#0891B2','#7C3AED','#DB2777','#D97706','#059669','#DC2626','#2563EB',
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function typeBadge(type: string) {
  if (type === 'customer') return <span className="badge badge-customer">Customer</span>
  if (type === 'supplier') return <span className="badge badge-supplier">Supplier</span>
  return <span className="badge badge-both">Both</span>
}

function statusBadge(active: boolean) {
  return active
    ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46' }}>Active</span>
    : <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>Inactive</span>
}

export default function ContactsTable({
  contacts,
  orgId,
  isAdmin,
}: {
  contacts: Contact[]
  orgId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tab, setTab] = useState<'all' | 'customer' | 'supplier'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [typeOpen, setTypeOpen] = useState(false)

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (!showInactive && !c.is_active) return false
      if (tab !== 'all' && c.type !== tab) return false
      if (typeFilter && c.type !== typeFilter.toLowerCase()) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.bill_city ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [contacts, search, typeFilter, tab, showInactive])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const counts = useMemo(() => ({
    all: contacts.filter(c => showInactive || c.is_active).length,
    customer: contacts.filter(c => c.type === 'customer' && (showInactive || c.is_active)).length,
    supplier: contacts.filter(c => c.type === 'supplier' && (showInactive || c.is_active)).length,
  }), [contacts, showInactive])

  function pickTab(t: typeof tab) {
    setTab(t)
    setTypeFilter('')
    setPage(1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Contacts</div>
            <div className="page-subtitle">Customers &amp; suppliers in one place</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Contact
            </button>
          </div>
        </div>
        <div className="tab-bar">
          {(['all', 'customer', 'supplier'] as const).map(t => (
            <div
              key={t}
              className={`tab-item${tab === t ? ' active' : ''}`}
              onClick={() => pickTab(t)}
            >
              {t === 'all' ? 'All' : t === 'customer' ? 'Customers' : 'Suppliers'}
              <span className="tab-count">{counts[t]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar-card">
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="filter-search"
            placeholder="Search contacts…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        {/* Type filter */}
        <div style={{ position: 'relative' }}>
          <button
            className={`filter-dd-btn${typeFilter ? ' active-filter' : ''}`}
            onClick={() => setTypeOpen(o => !o)}
          >
            <span>{typeFilter || 'All Types'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }}>
              <div className="col-dropdown-title">Type</div>
              {['', 'Customer', 'Supplier'].map(v => (
                <div
                  key={v}
                  className={`fp-item${typeFilter === v ? ' active' : ''}`}
                  onClick={() => { setTypeFilter(v); setPage(1); setTypeOpen(false) }}
                >
                  {v || 'All Types'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Show inactive */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => { setShowInactive(e.target.checked); setPage(1) }}
            style={{ accentColor: 'var(--teal)', cursor: 'pointer', width: 14, height: 14 }}
          />
          Show inactive
        </label>

        <div className="filter-spacer" />

        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          <strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> contacts
        </span>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Currency</th>
                <th>Price Tier</th>
                <th>Payment Terms</th>
                <th>Tax Rate</th>
                <th>City</th>
                <th>Email</th>
                <th>Phone</th>
                <th style={{ textAlign: 'right' }}>Balance Owing</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No contacts match your search.' : 'No contacts yet. Add one to get started.'}
                  </td>
                </tr>
              )}
              {paginated.map(c => (
                <tr key={c.id} onClick={() => {}}>
                  <td>
                    <div className="contact-cell">
                      <div
                        className="contact-avatar"
                        style={{ background: avatarColor(c.name), color: '#fff' }}
                      >
                        {initials(c.name)}
                      </div>
                      <div>
                        <div className="contact-name">{c.name}</div>
                        {c.tax_number && <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{c.tax_number}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{typeBadge(c.type)}</td>
                  <td>{statusBadge(c.is_active ?? true)}</td>
                  <td className="td-muted">{c.currency ?? '—'}</td>
                  <td className="td-muted">{c.tier ?? '—'}</td>
                  <td className="td-muted">{c.terms ?? '—'}</td>
                  <td className="td-muted">{c.tax_rate ?? '—'}</td>
                  <td className="td-muted">{[c.bill_city, c.bill_country].filter(Boolean).join(', ') || '—'}</td>
                  <td className="td-muted">{c.email ?? '—'}</td>
                  <td className="td-mono">{c.phone ?? '—'}</td>
                  <td style={{ textAlign: 'right' }} className="td-muted">
                    {c.balance_owing ? `$${Number(c.balance_owing).toFixed(2)}` : '—'}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation() }} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
