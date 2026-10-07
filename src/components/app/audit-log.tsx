'use client'

// src/components/app/audit-log.tsx
// Audit Log — a line for every action in the platform (orders, picks, stock, contacts, products, settings…).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Ev = {
  id: string; created_at: string; category: string; action: string; ref: string | null
  detail: string | null; user_name: string | null; entity_type: string | null; entity_id: string | null
}

const CATS: Record<string, [string, string]> = {
  Sales: ['#DBEAFE', '#1E40AF'], Purchases: ['#EDE9FE', '#5B21B6'], Inventory: ['#D1FAE5', '#065F46'],
  Transfers: ['#FEF3C7', '#92400E'], Adjustments: ['#FEF9C3', '#854D0E'], Contacts: ['#FCE7F3', '#9D174D'], Settings: ['#F1F5F9', '#475569'], Xero: ['#CFFAFE', '#155E75'], Email: ['#FFEDD5', '#9A3412'],
}
const CAT_LIST = Object.keys(CATS)
const PAGE_SIZE = 15

// Click a reference to open the record
function linkFor(e: Ev): string | null {
  if (!e.entity_id || /Deleted/.test(e.action)) return null
  switch (e.entity_type) {
    case 'sales_orders': return `/sales/${e.entity_id}`
    case 'purchase_orders': return `/purchases/${e.entity_id}`
    case 'transfer_orders': return `/transfers/${e.entity_id}`
    case 'adjustment_orders': return `/products/adjustments/${e.entity_id}`
    case 'contacts': return `/contacts?open=${e.entity_id}`
    case 'products': return `/products?open=${e.entity_id}`
    default: return null
  }
}

const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString()

export default function AuditLog({ allowed, disabled = false }: { allowed: boolean; disabled?: boolean }) {
  const router = useRouter()
  const [events, setEvents] = useState<Ev[]>([])
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [cat, setCat] = useState('')
  const [user, setUser] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [catOpen, setCatOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t) }, [search])

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams()
    if (debounced) p.set('q', debounced)
    if (cat) p.set('category', cat)
    if (user) p.set('user', user)
    if (from) p.set('from', dayStart(from))
    if (to) p.set('to', dayEnd(to))
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return p
  }, [debounced, cat, user, from, to])

  useEffect(() => {
    if (!allowed) return
    let live = true
    setLoading(true)
    fetch(`/api/org/audit?${params({ page: String(page), size: String(PAGE_SIZE) })}`)
      .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!live) return
        if (!ok) { setError(data.error ?? 'Could not load the audit log.'); return }
        setError(null); setEvents(data.events ?? []); setTotal(data.total ?? 0); setUsers(data.users ?? [])
        scrollRef.current?.scrollTo(0, 0)
      })
      .catch(() => live && setError('Network error — please try again.'))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [allowed, params, page])

  useEffect(() => { setPage(1) }, [debounced, cat, user, from, to])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = (page - 1) * PAGE_SIZE

  function exportCsv() {
    window.location.href = `/api/org/audit?${params({ format: 'csv' })}`
  }

  const pageBtn = (active: boolean): React.CSSProperties => ({
    minWidth: 32, height: 32, borderRadius: 8, padding: '0 8px', cursor: 'pointer', fontSize: 12.5, fontWeight: active ? 700 : 400,
    border: `1.5px solid ${active ? 'var(--teal)' : 'var(--gray-200)'}`, background: active ? 'var(--teal)' : 'var(--white)', color: active ? '#fff' : 'var(--gray-400)',
  })
  const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: '0.05em' }

  if (!allowed) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>
        {disabled ? 'Access denied — the audit log is turned off for your organisation.' : 'Only admins can view the audit log.'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setCatOpen(false); setUserOpen(false) }}>
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Audit Log</div>
            <div className="page-subtitle">Complete record of all system actions and changes</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-outline" onClick={exportCsv}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search actions, orders, users…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${cat ? ' active-filter' : ''}`} onClick={() => { setCatOpen(o => !o); setUserOpen(false) }}>
            <span>{cat || 'All Categories'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {catOpen && (
            <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">Category</div>
              <div className={`fp-item${!cat ? ' active' : ''}`} onClick={() => { setCat(''); setCatOpen(false) }}>All Categories</div>
              {CAT_LIST.map(c => <div key={c} className={`fp-item${cat === c ? ' active' : ''}`} onClick={() => { setCat(c); setCatOpen(false) }}>{c}</div>)}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${user ? ' active-filter' : ''}`} onClick={() => { setUserOpen(o => !o); setCatOpen(false) }}>
            <span>{user || 'All Users'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {userOpen && (
            <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">User</div>
              <div className={`fp-item${!user ? ' active' : ''}`} onClick={() => { setUser(''); setUserOpen(false) }}>All Users</div>
              {users.map(u => <div key={u} className={`fp-item${user === u ? ' active' : ''}`} onClick={() => { setUser(u); setUserOpen(false) }}>{u}</div>)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" className="filter-dd-btn" style={{ width: 140, cursor: 'pointer' }} value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>to</span>
          <input type="date" className="filter-dd-btn" style={{ width: 140, cursor: 'pointer' }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="filter-spacer" />
        <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}><strong>{total}</strong> events</span>
      </div>

      <div className="table-container">
        {error && <div style={{ margin: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
        <div className="table-wrap" ref={scrollRef}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>TIMESTAMP</th>
              <th style={{ width: 120 }}>CATEGORY</th>
              <th style={{ width: 180 }}>ACTION</th>
              <th style={{ width: 170 }}>REFERENCE</th>
              <th>DETAIL</th>
              <th style={{ width: 160 }}>USER</th>
            </tr>
          </thead>
          <tbody>
            {!loading && events.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--gray-400)' }}>No audit events found</td></tr>
            )}
            {events.map(e => {
              const [bg, color] = CATS[e.category] ?? ['#F1F5F9', '#475569']
              const d = new Date(e.created_at)
              const href = linkFor(e)
              return (
                <tr key={e.id} style={{ opacity: loading ? 0.6 : 1, cursor: 'default' }}>
                  <td style={{ padding: '10px 16px', fontSize: 12, whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600, color: 'var(--slate)' }}>{d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: bg, color, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{e.category}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--gray-400)', overflowWrap: 'anywhere' }}>{e.action}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--teal)', overflowWrap: 'anywhere' }}>
                    {href ? <a href={href} onClick={ev => { ev.preventDefault(); router.push(href) }} style={{ color: 'inherit', textDecoration: 'none' }}>{e.ref}</a> : e.ref}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--gray-400)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{e.detail}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--slate)', overflowWrap: 'anywhere' }}>{e.user_name ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="table-footer">
        <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>
          {total ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} events` : '0 events'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={{ ...pageBtn(false), opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'default' : 'pointer' }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
            if (totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2) {
              return <button key={p} style={pageBtn(p === page)} onClick={() => setPage(p)}>{p}</button>
            }
            if (Math.abs(p - page) === 3) return <span key={p} style={{ padding: '0 4px', color: 'var(--gray-400)', lineHeight: '32px' }}>…</span>
            return null
          })}
          <button style={{ ...pageBtn(false), opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'default' : 'pointer' }} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
        </div>
      </div>
    </div>
  )
}
