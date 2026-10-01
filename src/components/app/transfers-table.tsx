'use client'

// src/components/app/transfers-table.tsx
// Transfers list — same layout as Sales. Statuses: Draft → Open → Picking → Picked → Closed (or Cancelled).

import { useState, useMemo, useEffect } from 'react'
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

function statusKey(status: string): 'draft' | 'open' | 'picking' | 'picked' | 'closed' | 'cancelled' {
  const s = (status ?? '').toLowerCase()
  if (s === 'open' || s === 'in transit') return 'open'
  if (s === 'picking') return 'picking'
  if (s === 'picked') return 'picked'
  if (s === 'closed' || s === 'completed') return 'closed'
  if (s === 'cancelled') return 'cancelled'
  return 'draft'
}

function statusBadge(status: string) {
  switch (statusKey(status)) {
    case 'open': return <span className="badge badge-open">Open</span>
    case 'picking': return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Picking</span>
    case 'picked': return <span className="badge" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>Picked</span>
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
  { key: 'picked', label: 'Picked' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

// All / Open / Closed are always shown; the rest only when at least one transfer has that status
const HIDE_WHEN_EMPTY = new Set<string>(['draft', 'picking', 'picked', 'cancelled'])

type Tab = typeof TABS[number]['key']

const COLS = [
  { key: 'tr_number',     label: 'Transfer #',    required: true  },
  { key: 'transfer_date', label: 'Date',          required: false },
  { key: 'from',          label: 'From',          required: false },
  { key: 'to',            label: 'To',            required: false },
  { key: 'status',        label: 'Status',        required: false },
  { key: 'expected_date', label: 'Expected Date', required: false },
  { key: 'notes',         label: 'Notes',         required: false },
] as const

type ColKey = typeof COLS[number]['key']
const DEFAULT_COLS: ColKey[] = ['tr_number', 'transfer_date', 'from', 'to', 'status', 'expected_date']
const LS_KEY = 'transfers_visible_cols'

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

export default function TransfersTable({ transfers, locations }: { transfers: Transfer[]; locations: Location[]; orgId?: string }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<
    | { kind: 'cancel'; tr: Transfer }
    | { kind: 'complete'; tr: Transfer }
    | { kind: 'bulk-complete'; ids: string[]; skipped: number }
    | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  function flash(ok: boolean, text: string) {
    setNotice({ ok, text })
    setTimeout(() => setNotice(n => (n && n.text === text ? null : n)), 6000)
  }

  useEffect(() => { setVisibleCols(loadCols()) }, [])

  function toggleCol(key: ColKey) {
    if (COLS.find(c => c.key === key)?.required) return
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }
  const activeCols = COLS.filter(c => visibleCols.has(c.key))

  const filtered = useMemo(() => transfers.filter(t => {
    if (tab !== 'all' && statusKey(t.status) !== tab) return false
    if (fromFilter && t.from_location_id !== fromFilter) return false
    if (toFilter && t.to_location_id !== toFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (t.tr_number ?? '').toLowerCase().includes(q) || (t.from_location_name ?? '').toLowerCase().includes(q) || (t.to_location_name ?? '').toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)
    }
    return true
  }), [transfers, tab, search, fromFilter, toFilter])

  const counts = useMemo(() => ({
    all: transfers.length,
    draft: transfers.filter(t => statusKey(t.status) === 'draft').length,
    open: transfers.filter(t => statusKey(t.status) === 'open').length,
    picking: transfers.filter(t => statusKey(t.status) === 'picking').length,
    picked: transfers.filter(t => statusKey(t.status) === 'picked').length,
    closed: transfers.filter(t => statusKey(t.status) === 'closed').length,
    cancelled: transfers.filter(t => statusKey(t.status) === 'cancelled').length,
  }), [transfers])

  const visibleTabs = TABS.filter(t => !HIDE_WHEN_EMPTY.has(t.key) || counts[t.key] > 0)
  // if the active tab disappears (e.g. last Picked transfer completed), fall back to All
  useEffect(() => { if (tab !== 'all' && !visibleTabs.some(t => t.key === tab)) setTab('all') }, [counts]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const fromName = locations.find(l => l.id === fromFilter)?.name ?? 'All From'
  const toName = locations.find(l => l.id === toFilter)?.name ?? 'All To'

  // ── Selection / bulk actions ──
  const allPageSelected = paginated.length > 0 && paginated.every(t => selected.has(t.id))
  function toggleAll(checked: boolean) {
    setSelected(prev => { const n = new Set(prev); paginated.forEach(t => (checked ? n.add(t.id) : n.delete(t.id))); return n })
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const selectedTr = transfers.filter(t => selected.has(t.id))
  const toPick = selectedTr.filter(t => statusKey(t.status) === 'open')
  const toComplete = selectedTr.filter(t => statusKey(t.status) === 'picked')

  async function bulkComplete(ids: string[]) {
    setBusy(true)
    try {
      const res = await fetch('/api/org/transfers/bulk-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { flash(false, data.error ?? 'Could not complete these transfers'); return }
      const completed = (data.completed ?? []) as string[]
      const failed = (data.failed ?? []) as { tr_number: string; error: string }[]
      flash(failed.length === 0, `${completed.length} transfer${completed.length !== 1 ? 's' : ''} completed` + (failed.length ? `. ${failed.length} failed — ${failed.map(f => `${f.tr_number}: ${f.error}`).join('; ')}` : '.'))
      setSelected(new Set())
      router.refresh()
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }
  async function completeOne(t: Transfer) {
    setBusy(true)
    try {
      const res = await fetch(`/api/org/transfers/${t.id}/complete`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) flash(false, `${t.tr_number}: ${data.error ?? 'Could not complete this transfer'}`)
      else { flash(true, `${t.tr_number} completed.`); router.refresh() }
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }
  async function cancelOne(t: Transfer) {
    setBusy(true)
    try {
      const res = await fetch(`/api/org/transfers/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Cancelled' }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) flash(false, `${t.tr_number}: ${data.error ?? 'Could not cancel this transfer'}`)
      else { flash(true, `${t.tr_number} cancelled.`); router.refresh() }
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }

  const menuTr = menu ? transfers.find(t => t.id === menu.id) ?? null : null
  function openMenu(e: React.MouseEvent, t: Transfer) {
    e.stopPropagation()
    if (menu?.id === t.id) { setMenu(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const width = 210
    const x = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    const y = r.bottom + 160 > window.innerHeight ? Math.max(8, r.top - 160) : r.bottom + 4
    setMenu({ id: t.id, x, y })
  }

  function isOverdue(t: Transfer) {
    if (!t.expected_date) return false
    if (['closed', 'cancelled'].includes(statusKey(t.status))) return false
    return new Date(t.expected_date) < new Date()
  }

  const closeAll = () => { setFromOpen(false); setToOpen(false); setColOpen(false); setMenu(null) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={closeAll}>

      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Transfers</div>
            <div className="page-subtitle">Move stock between locations and bins</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => router.push('/transfers/new')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Transfer
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

      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search transfer #, location, notes…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        {([['from', fromFilter, setFromFilter, fromOpen, setFromOpen, fromName, 'All From', 'From Location'], ['to', toFilter, setToFilter, toOpen, setToOpen, toName, 'All To', 'To Location']] as const).map(([k, val, setVal, open, setOpen, label, allLabel, title]) => (
          <div key={k} style={{ position: 'relative' }}>
            <button className={`filter-dd-btn${val ? ' active-filter' : ''}`} onClick={() => { const next = !open; closeAll(); setOpen(next) }}>
              <span>{label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {open && (
              <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
                <div className="col-dropdown-title">{title}</div>
                <div className={`fp-item${!val ? ' active' : ''}`} onClick={() => { setVal(''); setOpen(false); setPage(1) }}>{allLabel}</div>
                {locations.map(l => (
                  <div key={l.id} className={`fp-item${val === l.id ? ' active' : ''}`} onClick={() => { setVal(l.id); setOpen(false); setPage(1) }}>{l.name}</div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="filter-spacer" />
        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}><strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> transfers</span>

        <div style={{ position: 'relative' }}>
          <button className="filter-dd-btn" onClick={e => { e.stopPropagation(); const next = !colOpen; closeAll(); setColOpen(next) }} title="Show/hide columns">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Columns</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {colOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 190, right: 0, left: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="col-dropdown-title">Columns</div>
              {COLS.map(c => (
                <div key={c.key} className="fp-item" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: c.required ? 0.5 : 1, cursor: c.required ? 'default' : 'pointer' }} onClick={() => toggleCol(c.key)}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${visibleCols.has(c.key) ? 'var(--teal)' : 'var(--gray-300)'}`, background: visibleCols.has(c.key) ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {visibleCols.has(c.key) && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--slate)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div style={{ margin: '0 0 10px', padding: '10px 14px', borderRadius: 10, fontSize: 13, background: notice.ok ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${notice.ok ? '#A7F3D0' : '#FECACA'}`, color: notice.ok ? '#065F46' : '#B91C1C', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>✕</button>
        </div>
      )}

      <div className="table-container">
        <div className="table-toolbar">
          {selected.size > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{selected.size} selected</span>
              <div style={{ width: 1, height: 18, background: 'var(--gray-200)', margin: '0 4px' }} />
              {toPick.length > 0 && (
                <button className="btn-sm btn-sm-primary" title={`${toPick.length} Open transfer${toPick.length !== 1 ? 's' : ''} will load`} onClick={() => router.push(`/transfers/pick?ids=${toPick.map(t => t.id).join(',')}`)}>Start Picking</button>
              )}
              {toComplete.length > 0 && (
                <button className="btn-sm btn-sm-primary" title={`${toComplete.length} Picked transfer${toComplete.length !== 1 ? 's' : ''} will be completed`} onClick={() => setDialog({ kind: 'bulk-complete', ids: toComplete.map(t => t.id), skipped: selected.size - toComplete.length })}>Complete Transfer</button>
              )}
              {toPick.length === 0 && toComplete.length === 0 && (
                <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>No selected transfer is ready to pick or complete.</span>
              )}
              <button className="btn-sm btn-sm-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>✕ Clear</button>
            </div>
          ) : (
            <span className="table-count"><strong>{filtered.length}</strong> transfers</span>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={e => toggleAll(e.target.checked)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                </th>
                {activeCols.map(c => <th key={c.key}>{c.label}</th>)}
                <th style={{ width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={activeCols.length + 2} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No transfers match your search.' : 'No transfers yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(t => (
                <tr key={t.id} onClick={() => router.push(`/transfers/${t.id}`)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                  </td>
                  {activeCols.map(c => {
                    switch (c.key) {
                      case 'tr_number': return <td key={c.key}><span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>{t.tr_number ?? '—'}</span></td>
                      case 'transfer_date': return <td key={c.key} className="td-muted">{fmtDate(t.transfer_date)}</td>
                      case 'from': return <td key={c.key}><span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{t.from_location_name ?? '—'}</span></td>
                      case 'to': return <td key={c.key}><span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{t.to_location_name ?? '—'}</span></td>
                      case 'status': return <td key={c.key}>{statusBadge(t.status)}</td>
                      case 'expected_date': return (
                        <td key={c.key}>
                          <span style={{ color: isOverdue(t) ? 'var(--danger)' : 'var(--gray-400)', fontSize: 13, fontWeight: isOverdue(t) ? 600 : 400 }}>
                            {fmtDate(t.expected_date)}{isOverdue(t) ? ' ⚠' : ''}
                          </span>
                        </td>
                      )
                      case 'notes': return <td key={c.key} className="td-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes ?? '—'}</td>
                    }
                  })}
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); router.push(`/transfers/${t.id}`) }} title="View">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button className="row-action-btn" onClick={e => openMenu(e, t)} title="More actions">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
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

      {/* Row actions menu */}
      {menu && menuTr && (() => {
        const t = menuTr
        const k = statusKey(t.status)
        const item = (label: string, onClick: () => void, opts: { danger?: boolean } = {}) => (
          <div key={label} className="fp-item" onClick={e => { e.stopPropagation(); onClick() }} style={{ cursor: 'pointer', color: opts.danger ? 'var(--danger)' : undefined }}>{label}</div>
        )
        const sep = <div style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />
        return (
          <div className="inv-dropdown" style={{ display: 'block', position: 'fixed', left: menu.x, top: menu.y, width: 210, padding: 6, zIndex: 400 }} onClick={e => e.stopPropagation()}>
            {k === 'open' && item('Pick Order', () => router.push(`/transfers/${t.id}/pick`))}
            {k === 'picking' && item('Continue Picking', () => router.push(`/transfers/${t.id}/pick`))}
            {k === 'picked' && item('Complete Transfer', () => { setMenu(null); setDialog({ kind: 'complete', tr: t }) })}
            {k === 'draft' && item('Edit', () => router.push(`/transfers/${t.id}`))}
            {k !== 'closed' && k !== 'cancelled' && <>{sep}{item('Cancel Transfer', () => { setMenu(null); setDialog({ kind: 'cancel', tr: t }) }, { danger: true })}</>}
            {(k === 'closed' || k === 'cancelled') && item('View', () => router.push(`/transfers/${t.id}`))}
          </div>
        )
      })()}

      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: '24px 26px', width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {dialog.kind === 'cancel' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Cancel {dialog.tr.tr_number}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                The transfer moves to Cancelled{['picking', 'picked'].includes(statusKey(dialog.tr.status)) ? ' and anything already picked is released back to stock' : ''}. Are you sure?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Keep transfer</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => cancelOne(dialog.tr)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, cancel'}</button>
              </div>
            </>)}
            {dialog.kind === 'complete' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Complete {dialog.tr.tr_number}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                The picked stock moves from {dialog.tr.from_location_name} to {dialog.tr.to_location_name} and the transfer is closed. This can&apos;t be undone.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Go back</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => completeOne(dialog.tr)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, complete'}</button>
              </div>
            </>)}
            {dialog.kind === 'bulk-complete' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Complete {dialog.ids.length} transfer{dialog.ids.length !== 1 ? 's' : ''}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                The picked stock moves to its destination and the {dialog.ids.length === 1 ? 'transfer is' : 'transfers are'} closed. This can&apos;t be undone.
                {dialog.skipped > 0 && <> {dialog.skipped} other selected transfer{dialog.skipped !== 1 ? 's aren\'t' : ' isn\'t'} Picked and will be left as they are.</>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Go back</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => bulkComplete(dialog.ids)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, complete'}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
