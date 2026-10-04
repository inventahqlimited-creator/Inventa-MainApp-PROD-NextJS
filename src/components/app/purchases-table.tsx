'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { printPurchaseOrder } from '@/lib/purchase-order/print'
import { XeroColumnMenuItem, XeroPostNotice, XeroStatusBadge, useXeroColumn, usePostToXero, type XeroTableInfo } from '@/components/app/xero-sync-ui'
import { toast } from '@/components/app/toast'

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
  related_so_id?: string | null // sales order this order was created from / created from it
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
  { key: 'cancelled', label: 'Cancelled' },
] as const

// These tabs only appear when at least one order has that status
const HIDE_WHEN_EMPTY = new Set<string>(['draft', 'partial', 'cancelled'])

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
  xero,
  billReady = [],
}: {
  xero?: XeroTableInfo
  billReady?: string[] // closed orders with something received, so a bill can be posted
  orders: Order[]
  contacts: Contact[]
  locations: Location[]
  orgId: string
}) {
  const router = useRouter()
  const [xeroRecords, setXeroRecords] = useState(xero?.records ?? {})
  const xeroCol = useXeroColumn('purchases_xero_col')
  const showXero = Boolean(xero?.show) && xeroCol.on
  const xeroPost = usePostToXero('bill', (id, info) => setXeroRecords(r => ({ ...r, [id]: info })))
  const readyToBill = useMemo(() => new Set(billReady), [billReady])
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'cancel'; order: Order } | { kind: 'auto-receive'; ids: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  function flash(ok: boolean, text: string) {
    if (ok) toast.success(text)
    else toast.error(text)
  }

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
    setMenu(null)
  }

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (tab === 'draft' && o.status.toLowerCase() !== 'draft') return false
      if (tab === 'open' && o.status.toLowerCase() !== 'open') return false
      if (tab === 'partial' && o.status.toLowerCase() !== 'partially received') return false
      if (tab === 'closed' && o.status.toLowerCase() !== 'closed') return false
      if (tab === 'cancelled' && o.status.toLowerCase() !== 'cancelled') return false
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
    cancelled: orders.filter(o => o.status.toLowerCase() === 'cancelled').length,
  }), [orders])

  const visibleTabs = TABS.filter(t => !HIDE_WHEN_EMPTY.has(t.key) || counts[t.key] > 0)

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const supplierName = contacts.find(c => c.id === supplierFilter)?.name ?? 'All Suppliers'
  const locationName = locations.find(l => l.id === locationFilter)?.name ?? 'All Locations'

  // Ordered visible columns for rendering
  const activeCols = COLS.filter(c => visibleCols.has(c.key))

  // ── Selection / bulk actions ──
  const allPageSelected = paginated.length > 0 && paginated.every(o => selected.has(o.id))
  function toggleAll(checked: boolean) {
    setSelected(prev => { const n = new Set(prev); paginated.forEach(o => (checked ? n.add(o.id) : n.delete(o.id))); return n })
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const selectedOrders = orders.filter(o => selected.has(o.id))
  const toPrint = selectedOrders.filter(o => o.status.toLowerCase() !== 'cancelled')
  const toReceive = selectedOrders.filter(o => ['open', 'partially received'].includes(o.status.toLowerCase()))

  async function print(ids: string[], label?: string) {
    setMenu(null)
    const res = await printPurchaseOrder(ids)
    if (!res.ok) flash(false, label ? `${label}: ${res.error}` : res.error)
  }

  async function autoReceive(ids: string[]) {
    setBusy(true)
    try {
      const res = await fetch('/api/org/purchases/auto-receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { flash(false, data.error ?? 'Could not receive these orders'); return }
      const done = (data.received ?? []) as { po_number: string | null }[]
      const failed = (data.failed ?? []) as { po_number: string | null; error: string }[]
      flash(failed.length === 0, `${done.length} order${done.length !== 1 ? 's' : ''} received and closed` + (failed.length ? `. ${failed.length} failed — ${failed.map(f => `${f.po_number}: ${f.error}`).join('; ')}` : '.'))
      setSelected(new Set())
      router.refresh()
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }

  async function cancelOne(o: Order) {
    setBusy(true)
    try {
      const res = await fetch(`/api/org/purchases/${o.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Cancelled' }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) flash(false, `${o.po_number}: ${data.error ?? 'Could not cancel this order'}`)
      else { flash(true, `${o.po_number} cancelled.`); router.refresh() }
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }

  const menuOrder = menu ? orders.find(o => o.id === menu.id) ?? null : null
  function openMenu(e: React.MouseEvent, o: Order) {
    e.stopPropagation()
    if (menu?.id === o.id) { setMenu(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const width = 230
    const x = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    // open upward when close to the bottom of the window
    const y = r.bottom + 290 > window.innerHeight ? Math.max(8, r.top - 290) : r.bottom + 4
    setMenu({ id: o.id, x, y })
  }

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
          {visibleTabs.map(t => (
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
              {xero?.show && <XeroColumnMenuItem on={xeroCol.on} onToggle={xeroCol.toggle} />}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div style={{ margin: '0 0 10px', padding: '10px 14px', borderRadius: 10, fontSize: 13, background: notice.ok ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${notice.ok ? '#A7F3D0' : '#FECACA'}`, color: notice.ok ? '#065F46' : '#B91C1C', display: 'flex', justifyContent: 'space-between', gap: 12 }} onClick={e => e.stopPropagation()}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Table */}
      <XeroPostNotice message={xeroPost.message} onClose={xeroPost.clearMessage} />

      <div className="table-container">
        <div className="table-toolbar" onClick={e => e.stopPropagation()}>
          {selected.size > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{selected.size} selected</span>
              <div style={{ width: 1, height: 18, background: 'var(--gray-200)', margin: '0 4px' }} />
              {toReceive.length > 0 && (
                <button className="btn-sm btn-sm-primary" disabled={busy} title={`${toReceive.length} order${toReceive.length !== 1 ? 's' : ''} will be received in full and closed`} onClick={() => setDialog({ kind: 'auto-receive', ids: toReceive.map(o => o.id) })}>Auto Receive</button>
              )}
              {toPrint.length > 0 && (
                <button className="btn-sm btn-sm-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => print(toPrint.map(o => o.id))}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
                  {toPrint.length > 1 ? `Print Purchase Orders (${toPrint.length})` : 'Print Purchase Order'}
                </button>
              )}
              {toPrint.length === 0 && toReceive.length === 0 && (
                <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>No selected order can be printed or received.</span>
              )}
              <button className="btn-sm btn-sm-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>✕ Clear</button>
            </div>
          ) : (
            <span className="table-count"><strong>{filtered.length}</strong> orders</span>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={e => toggleAll(e.target.checked)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                </th>
                {activeCols.map(c => {
                  if (c.key === 'total_amount') return <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>
                  return <th key={c.key}>{c.label}</th>
                })}
                {showXero && <th>Xero</th>}
                <th style={{ width: 76 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={activeCols.length + 2 + (showXero ? 1 : 0)} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No orders match your search.' : 'No purchase orders yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(o => {
                const overdue = isOverdue(o.expected_date, o.status)
                return (
                  <tr key={o.id} onClick={() => router.push(`/purchases/${o.id}`)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                    </td>
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
                          return <td key={(c as any).key}>—</td>
                      }
                    })}
                    {showXero && <td>{xeroRecords[o.id] ? <XeroStatusBadge info={xeroRecords[o.id]} /> : null}</td>}
                    <td>
                      <div className="row-actions">
                        <button className="row-action-btn" onClick={e => { e.stopPropagation(); router.push(`/purchases/${o.id}`) }} title="View">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button className="row-action-btn" onClick={e => openMenu(e, o)} title="More actions">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
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

      {/* Row actions menu */}
      {menu && menuOrder && (() => {
        const o = menuOrder
        const k = o.status.toLowerCase()
        const cancelled = k === 'cancelled'
        const editable = k === 'draft' || k === 'open'
        const item = (label: string, onClick: (() => void) | null, opts: { danger?: boolean; soon?: boolean; icon?: React.ReactNode } = {}) => (
          <div
            key={label}
            className="fp-item"
            onClick={e => { e.stopPropagation(); if (!onClick || opts.soon) return; onClick() }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: onClick && !opts.soon ? 'pointer' : 'default', opacity: opts.soon ? 0.5 : 1, color: opts.danger ? 'var(--danger)' : undefined }}
          >
            <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{opts.icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {opts.soon && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', borderRadius: 5, padding: '1px 6px' }}>Soon</span>}
          </div>
        )
        const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d}/></svg>
        const sep = (key: string) => <div key={key} style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />
        // can't cancel once any stock has been received against the order
        const canCancel = editable
        return (
          <div className="inv-dropdown" style={{ display: 'block', position: 'fixed', left: menu.x, top: menu.y, width: 230, padding: 6, zIndex: 400 }} onClick={e => e.stopPropagation()}>
            {editable && item('Edit Order', () => { setMenu(null); router.push(`/purchases/${o.id}?edit=1`) }, { icon: ic('M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z') })}
            {!cancelled && item('Print', () => print([o.id], o.po_number ?? undefined), { icon: ic('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z') })}
            {xero?.show && xero.canPost && readyToBill.has(o.id) && xeroRecords[o.id]?.status !== 'synced' && item('Post bill to Xero', () => { setMenu(null); void xeroPost.post(o.id) }, { icon: ic('M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3') })}
            {xero?.show && xeroRecords[o.id]?.status === 'synced' && xeroRecords[o.id]?.url && item('Open bill in Xero', () => { setMenu(null); window.open(xeroRecords[o.id]?.url ?? '', '_blank', 'noopener') }, { icon: ic('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3') })}
            {item('Email', null, { soon: true, icon: ic('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6') })}
            {sep('s1')}
            {item('Clone Order', () => { setMenu(null); router.push(`/purchases/new?clone=${o.id}`) }, { icon: ic('M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1') })}
            {!cancelled && item('Create Sales Order', () => { setMenu(null); router.push(`/sales/new?from_po=${o.id}`) }, { icon: ic('M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0') })}
            {o.related_so_id && item('Open Related Order', () => { setMenu(null); router.push(`/sales/${o.related_so_id}`) }, { icon: ic('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71') })}
            {canCancel && <>{sep('s2')}{item('Cancel Order', () => { setMenu(null); setDialog({ kind: 'cancel', order: o }) }, { danger: true, icon: ic('M18 6 6 18M6 6l12 12') })}</>}
          </div>
        )
      })()}

      {/* Dialogs */}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: '24px 26px', width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {dialog.kind === 'cancel' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Cancel {dialog.order.po_number}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>The order moves to Cancelled and its quantities will no longer show as On Order. Are you sure?</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Keep order</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => cancelOne(dialog.order)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, cancel order'}</button>
              </div>
            </>)}
            {dialog.kind === 'auto-receive' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Auto receive {dialog.ids.length} order{dialog.ids.length !== 1 ? 's' : ''}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                The full outstanding quantity of every line will be received into each order&apos;s delivery location (no bin) and the order{dialog.ids.length !== 1 ? 's' : ''} will be closed. This can&apos;t be undone.
                {selected.size - dialog.ids.length > 0 ? ` ${selected.size - dialog.ids.length} selected order${selected.size - dialog.ids.length !== 1 ? 's are' : ' is'} not open and will be skipped.` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Go back</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => autoReceive(dialog.ids)} disabled={busy}>{busy ? 'Receiving…' : 'Yes, receive'}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
