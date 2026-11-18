'use client'
// src/components/app/returns-table.tsx — Sales → Returns. One row per credit note, laid out like the Sales list:
// status tabs, search, location filter, column picker, eye (view) and ⋮ (more actions) on each row, pagination.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { printCreditNotes } from '@/lib/credit-notes/print'
import { toast } from '@/components/app/toast'

type Row = {
  id: string; cn_number: string; so_id: string; so_number: string | null; customer_name: string | null; return_date: string | null
  reason: string | null; status: string; total_amount: number | null; currency: string | null; location_id: string | null; location_name: string | null
}
type Location = { id: string; name: string }

export const cnBadge = (status: string) => {
  const s = status.toLowerCase()
  return s === 'closed' ? <span className="badge badge-closed">Closed</span>
    : s === 'cancelled' ? <span className="badge badge-cancelled">Cancelled</span>
    : <span className="badge badge-open">Open</span>
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'Open', label: 'Open' },
  { key: 'Closed', label: 'Closed' },
  { key: 'Cancelled', label: 'Cancelled' },
] as const
type Tab = typeof TABS[number]['key']
// shown only when at least one credit note has that status
const HIDE_WHEN_EMPTY = new Set<string>(['Cancelled'])

const COLS = [
  { key: 'cn_number',   label: 'Credit Note #', required: true },
  { key: 'return_date', label: 'Date',          required: false },
  { key: 'so_number',   label: 'Sales Order',   required: false },
  { key: 'customer',    label: 'Customer',      required: false },
  { key: 'location',    label: 'Return To',     required: false },
  { key: 'reason',      label: 'Reason',        required: false },
  { key: 'status',      label: 'Status',        required: false },
  { key: 'total',       label: 'Total',         required: false },
] as const
type ColKey = typeof COLS[number]['key']
const DEFAULT_COLS: ColKey[] = ['cn_number', 'return_date', 'so_number', 'customer', 'location', 'reason', 'status', 'total']
const LS_KEY = 'returns_visible_cols'

function loadCols(): Set<ColKey> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (raw) { const parsed = JSON.parse(raw) as ColKey[]; if (Array.isArray(parsed)) return new Set(parsed) }
  } catch {}
  return new Set(DEFAULT_COLS)
}

function fmtDate(d: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}
const money = (n: number | null, c: string | null) => `${c ? c + ' ' : '$'}${Number(n ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ReturnsTable({ rows, enabled, locations, canProcess }: { rows: Row[]; enabled: boolean; locations: Location[]; canProcess: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'close' | 'cancel'; row: Row } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setVisibleCols(loadCols()) }, [])

  function toggleCol(key: ColKey) {
    if (COLS.find(c => c.key === key)?.required) return
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }
  const activeCols = COLS.filter(c => visibleCols.has(c.key))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (tab === 'all' || r.status === tab) &&
      (!locationFilter || r.location_id === locationFilter) &&
      (!q || [r.cn_number, r.so_number, r.customer_name, r.reason].some(v => String(v ?? '').toLowerCase().includes(q))))
  }, [rows, tab, search, locationFilter])

  const counts = useMemo(() => ({
    all: rows.length,
    Open: rows.filter(r => r.status === 'Open').length,
    Closed: rows.filter(r => r.status === 'Closed').length,
    Cancelled: rows.filter(r => r.status === 'Cancelled').length,
  }), [rows])
  const visibleTabs = TABS.filter(t => !HIDE_WHEN_EMPTY.has(t.key) || counts[t.key] > 0)

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)
  const locationName = locations.find(l => l.id === locationFilter)?.name ?? 'All Locations'

  function openMenu(e: React.MouseEvent, r: Row) {
    e.stopPropagation()
    if (menu?.id === r.id) { setMenu(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const width = 230
    const x = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const y = rect.bottom + 240 > window.innerHeight ? Math.max(8, rect.top - 240) : rect.bottom + 4
    setMenu({ id: r.id, x, y })
  }

  async function act(r: Row, kind: 'close' | 'cancel') {
    setBusy(true)
    try {
      const res = await fetch(`/api/org/credit-notes/${r.id}/${kind}`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(`${r.cn_number}: ${d.error ?? `Could not ${kind} this credit note`}`); return }
      if (kind === 'close') {
        const x = d.xero as { state: string; error?: string } | undefined
        if (x?.state === 'failed') toast.error(`${r.cn_number} closed and stock returned, but Xero didn’t accept it: ${x.error}`)
        else toast.success(`${r.cn_number} closed. Stock returned to ${r.location_name ?? 'the location'}.`)
      } else toast.success(`${r.cn_number} cancelled.`)
      router.refresh()
    } catch { toast.error('Network error — please try again.') } finally { setBusy(false); setDialog(null) }
  }

  const menuRow = menu ? rows.find(r => r.id === menu.id) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setLocationOpen(false); setColOpen(false); setMenu(null) }}>
      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Returns</div>
            <div className="page-subtitle">Credit notes for goods customers send back</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-outline" onClick={() => router.push('/sales')}>Back to Sales</button>
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
          <input className="filter-search" placeholder="Search credit note #, order, customer, reason…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        {/* Location filter */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${locationFilter ? ' active-filter' : ''}`} onClick={() => { setLocationOpen(o => !o); setColOpen(false) }}>
            <span>{locationName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {locationOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 200 }}>
              <div className="col-dropdown-title">Return To</div>
              <div className={`fp-item${!locationFilter ? ' active' : ''}`} onClick={() => { setLocationFilter(''); setLocationOpen(false); setPage(1) }}>All Locations</div>
              {locations.map(l => (
                <div key={l.id} className={`fp-item${locationFilter === l.id ? ' active' : ''}`} onClick={() => { setLocationFilter(l.id); setLocationOpen(false); setPage(1) }}>{l.name}</div>
              ))}
            </div>
          )}
        </div>

        <div className="filter-spacer" />
        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}><strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> credit notes</span>

        {/* Column selector */}
        <div style={{ position: 'relative' }}>
          <button className="filter-dd-btn" onClick={e => { e.stopPropagation(); setColOpen(o => !o); setLocationOpen(false) }} title="Show/hide columns">
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

      {!enabled && (
        <div style={{ margin: '0 20px 10px', padding: '10px 14px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 13 }}>
          Credit notes are switched off. Turn them on in Settings → Sales → Credit Notes to create new ones.
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <div className="table-toolbar">
          <span className="table-count"><strong>{filtered.length}</strong> credit notes</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {activeCols.map(c => <th key={c.key} style={c.key === 'total' ? { textAlign: 'right' } : undefined}>{c.label}</th>)}
                <th style={{ width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan={activeCols.length + 1} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                  {search || locationFilter || tab !== 'all' ? 'No credit notes match your filters.' : 'No credit notes yet. Create one from a closed sales order.'}
                </td></tr>
              )}
              {paginated.map(r => (
                <tr key={r.id} onClick={() => router.push(`/sales/returns/${r.id}`)}>
                  {activeCols.map(c => {
                    switch (c.key) {
                      case 'cn_number': return <td key={c.key}><span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--slate)', fontSize: 13 }}>{r.cn_number}</span></td>
                      case 'return_date': return <td key={c.key} className="td-muted">{fmtDate(r.return_date)}</td>
                      case 'so_number': return <td key={c.key}><span onClick={e => { e.stopPropagation(); router.push(`/sales/${r.so_id}`) }} style={{ color: 'var(--teal)', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>{r.so_number ?? '—'}</span></td>
                      case 'customer': return <td key={c.key}><span style={{ fontWeight: 500, color: 'var(--slate)', fontSize: 13 }}>{r.customer_name ?? '—'}</span></td>
                      case 'location': return <td key={c.key} className="td-muted">{r.location_name ?? '—'}</td>
                      case 'reason': return <td key={c.key} className="td-muted" style={{ whiteSpace: 'normal', maxWidth: 280 }}>{r.reason ?? '—'}</td>
                      case 'status': return <td key={c.key}>{cnBadge(r.status)}</td>
                      case 'total': return <td key={c.key} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{money(r.total_amount, r.currency)}</td>
                    }
                  })}
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); router.push(`/sales/returns/${r.id}`) }} title="View">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button className="row-action-btn" onClick={e => openMenu(e, r)} title="More actions">
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
      {menu && menuRow && (() => {
        const r = menuRow
        const open = r.status === 'Open'
        const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d}/></svg>
        const item = (label: string, onClick: () => void, icon: React.ReactNode, danger = false) => (
          <div key={label} className="fp-item" onClick={e => { e.stopPropagation(); setMenu(null); onClick() }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', color: danger ? 'var(--danger)' : undefined }}>
            <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
          </div>
        )
        const sep = (key: string) => <div key={key} style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />
        return (
          <div className="inv-dropdown" style={{ display: 'block', position: 'fixed', left: menu.x, top: menu.y, width: 230, padding: 6, zIndex: 400 }} onClick={e => e.stopPropagation()}>
            {open && canProcess && <>{item('Close Credit Note', () => setDialog({ kind: 'close', row: r }), ic('M20 6 9 17l-5-5'))}{sep('s1')}</>}
            {open && canProcess && item('Edit Credit Note', () => router.push(`/sales/returns/${r.id}?edit=1`), ic('M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'))}
            {item('View Sales Order', () => router.push(`/sales/${r.so_id}`), ic('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8'))}
            {r.status !== 'Cancelled' && item('Print Credit Note', async () => { const res = await printCreditNotes([r.id]); if (!res.ok) toast.error(`${r.cn_number}: ${res.error}`) }, ic('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z'))}
            {open && canProcess && <>{sep('s2')}{item('Cancel Credit Note', () => setDialog({ kind: 'cancel', row: r }), ic('M18 6 6 18M6 6l12 12'), true)}</>}
          </div>
        )
      })()}

      {/* Confirm dialogs */}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: '24px 26px', width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>
              {dialog.kind === 'close' ? 'Close' : 'Cancel'} {dialog.row.cn_number}?
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
              {dialog.kind === 'close'
                ? <>The returned items go back into stock at <strong style={{ color: 'var(--slate)' }}>{dialog.row.location_name ?? 'the return location'}</strong> and the credit note is sent to Xero if it’s connected. A closed credit note can’t be changed or reopened.</>
                : 'This credit note will be cancelled. No stock has moved, so nothing needs undoing.'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Go back</button>
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', ...(dialog.kind === 'cancel' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}) }}
                onClick={() => act(dialog.row, dialog.kind)} disabled={busy}>
                {busy ? 'Please wait…' : dialog.kind === 'close' ? 'Close Credit Note' : 'Cancel Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
