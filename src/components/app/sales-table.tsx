'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PickListMenu from '@/components/app/pick-list-menu'
import { printPickList } from '@/lib/pick-list/print'
import { printPackingList } from '@/lib/packing-list/print'
import { printInvoice } from '@/lib/invoice/print'

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
const PICKING_GROUP = ['picking', 'partially picked', 'partially packed']
const CLOSED_GROUP = ['closed', 'shipped', 'delivered']

function statusKey(status: string): 'draft' | 'open' | 'picking' | 'picked' | 'packed' | 'closed' | 'cancelled' {
  const s = status.toLowerCase()
  if (OPEN_GROUP.includes(s)) return 'open'
  if (PICKING_GROUP.includes(s)) return 'picking'
  if (s === 'picked') return 'picked'
  if (s === 'packed') return 'packed'
  if (CLOSED_GROUP.includes(s)) return 'closed'
  if (s === 'cancelled') return 'cancelled'
  return 'draft'
}

function statusBadge(status: string) {
  switch (statusKey(status)) {
    case 'open': return <span className="badge badge-open">Open</span>
    case 'picking': return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Picking</span>
    case 'picked': return <span className="badge" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>Picked</span>
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
  { key: 'picked', label: 'Picked' },
  { key: 'packed', label: 'Packed' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

// These tabs only appear when at least one order has that status
const HIDE_WHEN_EMPTY = new Set<string>(['draft', 'picking', 'picked', 'packed', 'cancelled'])

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
  fulfilmentMode = 'full',
}: {
  orders: Order[]
  contacts: Contact[]
  locations: Location[]
  orgId: string
  fulfilmentMode?: string
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; printOpen: boolean } | null>(null)
  const [dialog, setDialog] = useState<
    | { kind: 'cancel'; order: Order }
    | { kind: 'close'; order: Order }
    | { kind: 'po'; order: Order }
    | { kind: 'bulk-close'; ids: string[]; skipped: number }
    | null
  >(null)
  const [poScope, setPoScope] = useState<'all' | 'short'>('all')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  function flash(ok: boolean, text: string) {
    setNotice({ ok, text })
    setTimeout(() => setNotice(n => (n && n.text === text ? null : n)), 6000)
  }

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
    picked: orders.filter(o => statusKey(o.status) === 'picked').length,
    packed: orders.filter(o => statusKey(o.status) === 'packed').length,
    closed: orders.filter(o => statusKey(o.status) === 'closed').length,
    cancelled: orders.filter(o => statusKey(o.status) === 'cancelled').length,
  }), [orders])

  const visibleTabs = TABS.filter(t => !HIDE_WHEN_EMPTY.has(t.key) || counts[t.key] > 0)

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const customerName = contacts.find(c => c.id === customerFilter)?.name ?? 'All Customers'
  const locationName = locations.find(l => l.id === locationFilter)?.name ?? 'All Locations'

  // ── Selection / bulk actions ──
  const allPageSelected = paginated.length > 0 && paginated.every(o => selected.has(o.id))
  function toggleAll(checked: boolean) {
    setSelected(prev => { const n = new Set(prev); paginated.forEach(o => (checked ? n.add(o.id) : n.delete(o.id))); return n })
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const selectedOrders = orders.filter(o => selected.has(o.id))
  const toPick = selectedOrders.filter(o => statusKey(o.status) === 'open')
  const toPack = selectedOrders.filter(o => statusKey(o.status) === 'picked')
  const toClose = selectedOrders.filter(o => statusKey(o.status) === 'packed')
  // Orders a pick list can be printed for (anything that has been, or can be, picked)
  const toPrint = selectedOrders.filter(o => ['open', 'picking', 'picked', 'packed'].includes(statusKey(o.status)))
  // Orders a packing list can be printed for (something has been picked, up to and including closed)
  const toPrintPacking = selectedOrders.filter(o => ['picking', 'picked', 'packed', 'closed'].includes(statusKey(o.status)))
  // Orders an invoice can be printed for (everything except drafts and cancelled orders)
  const toPrintInvoice = selectedOrders.filter(o => ['open', 'picking', 'picked', 'packed', 'closed'].includes(statusKey(o.status)))
  const pickEnabled = fulfilmentMode !== 'none'
  const packEnabled = fulfilmentMode === 'full'

  async function bulkClose(ids: string[]) {
    setBusy(true)
    try {
      const res = await fetch('/api/org/sales/bulk-close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { flash(false, data.error ?? 'Could not close these orders'); return }
      const closed = (data.closed ?? []) as string[]
      const failed = (data.failed ?? []) as { so_number: string; error: string }[]
      flash(failed.length === 0, `${closed.length} order${closed.length !== 1 ? 's' : ''} closed` + (failed.length ? `. ${failed.length} failed — ${failed.map(f => `${f.so_number}: ${f.error}`).join('; ')}` : '.'))
      setSelected(new Set())
      router.refresh()
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }

  // ── Row menu actions ──
  async function closeOne(o: Order) {
    setBusy(true)
    try {
      const res = await fetch(`/api/org/sales/${o.id}/close`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) flash(false, `${o.so_number}: ${data.error ?? 'Could not close this order'}`)
      else { flash(true, `${o.so_number} closed.`); router.refresh() }
    } catch { flash(false, 'Network error — please try again.') }
    finally { setBusy(false); setDialog(null) }
  }
  async function cancelOne(o: Order) {
    setBusy(true)
    try {
      const res = await fetch(`/api/org/sales/${o.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Cancelled' }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) flash(false, `${o.so_number}: ${data.error ?? 'Could not cancel this order'}`)
      else { flash(true, `${o.so_number} cancelled.`); router.refresh() }
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
    const y = r.bottom + 330 > window.innerHeight ? Math.max(8, r.top - 330) : r.bottom + 4
    setMenu({ id: o.id, x, y, printOpen: false })
  }

  function isOverdue(o: Order) {
    if (!o.expected_date) return false
    if (['closed', 'cancelled'].includes(statusKey(o.status))) return false
    return new Date(o.expected_date) < new Date()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setCustomerOpen(false); setLocationOpen(false); setActionsOpen(false); setColOpen(false); setMenu(null) }}>

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

      {notice && (
        <div style={{ margin: '0 0 10px', padding: '10px 14px', borderRadius: 10, fontSize: 13, background: notice.ok ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${notice.ok ? '#A7F3D0' : '#FECACA'}`, color: notice.ok ? '#065F46' : '#B91C1C', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <div className="table-toolbar">
          {selected.size > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{selected.size} selected</span>
              <div style={{ width: 1, height: 18, background: 'var(--gray-200)', margin: '0 4px' }} />
              {pickEnabled && toPick.length > 0 && (
                <button className="btn-sm btn-sm-primary" title={`${toPick.length} Open order${toPick.length !== 1 ? 's' : ''} will load`} onClick={() => router.push(`/sales/pick?ids=${toPick.map(o => o.id).join(',')}`)}>Start Picking</button>
              )}
              {packEnabled && toPack.length > 0 && (
                <button className="btn-sm btn-sm-primary" title={`${toPack.length} Picked order${toPack.length !== 1 ? 's' : ''} will load`} onClick={() => router.push(`/sales/pack?ids=${toPack.map(o => o.id).join(',')}`)}>Start Packing</button>
              )}
              {toClose.length > 0 && (
                <button className="btn-sm btn-sm-primary" title={`${toClose.length} Packed order${toClose.length !== 1 ? 's' : ''} will be closed`} onClick={() => setDialog({ kind: 'bulk-close', ids: toClose.map(o => o.id), skipped: selected.size - toClose.length })}>Close Order</button>
              )}
              {!(pickEnabled && toPick.length > 0) && !(packEnabled && toPack.length > 0) && toClose.length === 0 && (
                <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>No selected order is ready to pick, pack or close.</span>
              )}
              {(toPrint.length > 0 || toPrintPacking.length > 0 || toPrintInvoice.length > 0) && <PickListMenu ids={toPrint.map(o => o.id)} packIds={toPrintPacking.map(o => o.id)} invoiceIds={toPrintInvoice.map(o => o.id)} size="sm" onError={msg => flash(false, msg)} />}
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
                {activeCols.map(c => (
                  <th key={c.key} style={c.key === 'total_amount' ? { textAlign: 'right' } : undefined}>{c.label}</th>
                ))}
                <th style={{ width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={activeCols.length + 2} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No orders match your search.' : 'No sales orders yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(o => (
                <tr key={o.id} onClick={() => router.push(`/sales/${o.id}`)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                  </td>
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
                      <button className="row-action-btn" onClick={e => openMenu(e, o)} title="More actions">
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
      {menu && menuOrder && (() => {
        const o = menuOrder
        const k = statusKey(o.status)
        const closedLike = k === 'closed' || k === 'cancelled'
        const item = (label: string, onClick: (() => void) | null, opts: { danger?: boolean; soon?: boolean; icon?: React.ReactNode; chevron?: boolean } = {}) => (
          <div
            key={label}
            className="fp-item"
            onClick={e => { e.stopPropagation(); if (!onClick || opts.soon) return; onClick() }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: onClick && !opts.soon ? 'pointer' : 'default', opacity: opts.soon ? 0.5 : 1, color: opts.danger ? 'var(--danger)' : undefined }}
          >
            <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{opts.icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {opts.soon && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', borderRadius: 5, padding: '1px 6px' }}>Soon</span>}
            {opts.chevron && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: menu.printOpen ? 'rotate(90deg)' : undefined }}><polyline points="9 18 15 12 9 6"/></svg>}
          </div>
        )
        const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d}/></svg>
        const sep = (key: string) => <div key={key} style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />

        // 1 — the next fulfilment step for this order's status
        let fulfil: React.ReactNode = null
        if (k === 'open') {
          fulfil = fulfilmentMode === 'none'
            ? item('Close Order', () => { setMenu(null); setDialog({ kind: 'close', order: o }) }, { icon: ic('M20 6 9 17l-5-5') })
            : item('Pick Order', () => router.push(`/sales/${o.id}/pick`), { icon: ic('M21 8l-9-5-9 5v8l9 5 9-5z') })
        } else if (k === 'picking') {
          fulfil = item('Continue Picking', () => router.push(`/sales/${o.id}/pick`), { icon: ic('M21 8l-9-5-9 5v8l9 5 9-5z') })
        } else if (k === 'picked') {
          fulfil = fulfilmentMode === 'full'
            ? item('Pack Order', () => router.push(`/sales/${o.id}/pack`), { icon: ic('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z') })
            : item('Close Order', () => { setMenu(null); setDialog({ kind: 'close', order: o }) }, { icon: ic('M20 6 9 17l-5-5') })
        } else if (k === 'packed') {
          fulfil = item('Close Order', () => { setMenu(null); setDialog({ kind: 'close', order: o }) }, { icon: ic('M20 6 9 17l-5-5') })
        }

        return (
          <div
            className="inv-dropdown"
            style={{ display: 'block', position: 'fixed', left: menu.x, top: menu.y, width: 230, padding: 6, zIndex: 400 }}
            onClick={e => e.stopPropagation()}
          >
            {fulfil && <>{fulfil}{sep('s1')}</>}
            {item('Clone Order', () => router.push(`/sales/new?clone=${o.id}`), { icon: ic('M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1') })}
            {k !== 'cancelled' && item('Create Purchase Order', () => { setMenu(null); setPoScope('all'); setDialog({ kind: 'po', order: o }) }, { icon: ic('M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0') })}
            {sep('s2')}
            {item('Print', () => setMenu(m => (m ? { ...m, printOpen: !m.printOpen } : m)), { icon: ic('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z'), chevron: true })}
            {menu.printOpen && (
              <div style={{ paddingLeft: 16 }}>
                {['open', 'picking', 'picked', 'packed'].includes(k)
                  ? item('Pick List', async () => {
                      setMenu(null)
                      const res = await printPickList([o.id], 'single')
                      if (!res.ok) flash(false, `${o.so_number}: ${res.error}`)
                    })
                  : null}
                {['picking', 'picked', 'packed', 'closed'].includes(k)
                  ? item('Packing List', async () => {
                      setMenu(null)
                      const res = await printPackingList([o.id])
                      if (!res.ok) flash(false, `${o.so_number}: ${res.error}`)
                    })
                  : null}
                {['open', 'picking', 'picked', 'packed', 'closed'].includes(k)
                  ? item('Invoice', async () => {
                      setMenu(null)
                      const res = await printInvoice([o.id])
                      if (!res.ok) flash(false, `${o.so_number}: ${res.error}`)
                    })
                  : null}
              </div>
            )}
            {item('Email', null, { soon: true, icon: ic('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6') })}
            {item('Create Credit Note', null, { soon: true, icon: ic('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6') })}
            {!closedLike && <>{sep('s3')}{item('Cancel Order', () => { setMenu(null); setDialog({ kind: 'cancel', order: o }) }, { danger: true, icon: ic('M18 6 6 18M6 6l12 12') })}</>}
          </div>
        )
      })()}

      {/* Dialogs */}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: '24px 26px', width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {dialog.kind === 'cancel' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Cancel {dialog.order.so_number}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                The order moves to Cancelled{['picking', 'picked', 'packed'].includes(statusKey(dialog.order.status)) ? ', and anything already picked or packed is released back to stock' : ''}. Are you sure?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Keep order</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px', background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => cancelOne(dialog.order)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, cancel order'}</button>
              </div>
            </>)}

            {dialog.kind === 'close' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Close {dialog.order.so_number}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                {statusKey(dialog.order.status) === 'open'
                  ? 'Stock will be allocated automatically (oldest stock first, including batch, serial, expiry and bin where tracked) and the order closed.'
                  : 'The picked stock will be taken out of inventory and the order closed.'} This can&apos;t be undone.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Go back</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => closeOne(dialog.order)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, close order'}</button>
              </div>
            </>)}

            {dialog.kind === 'bulk-close' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Close {dialog.ids.length} order{dialog.ids.length !== 1 ? 's' : ''}?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                The picked stock on {dialog.ids.length === 1 ? 'this Packed order' : 'these Packed orders'} will be taken out of inventory. This can&apos;t be undone.
                {dialog.skipped > 0 && <> {dialog.skipped} other selected order{dialog.skipped !== 1 ? 's aren\'t' : ' isn\'t'} Packed and will be left as they are.</>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)} disabled={busy}>Go back</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => bulkClose(dialog.ids)} disabled={busy}>{busy ? 'Please wait…' : 'Yes, close'}</button>
              </div>
            </>)}

            {dialog.kind === 'po' && (<>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Create a purchase order?</div>
              <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 14 }}>
                Are you sure? Choose which items from {dialog.order.so_number} to put on the new purchase order. The ship-from location is used as the delivery location.
              </div>
              {([['all', 'All items', 'Every stocked item on the order, at the sales order quantity.'], ['short', 'Only items with no stock', 'Only items where the location holds less than the order needs.']] as const).map(([v, label, hint]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: `1.5px solid ${poScope === v ? 'var(--teal)' : 'var(--gray-200)'}`, background: poScope === v ? 'var(--teal-surface)' : 'var(--white)', borderRadius: 10, marginBottom: 8, cursor: 'pointer' }}>
                  <input type="radio" name="po-scope" checked={poScope === v} onChange={() => setPoScope(v)} style={{ accentColor: 'var(--teal)', marginTop: 3 }} />
                  <span><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)' }}>{label}</span><br /><span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{hint}</span></span>
                </label>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setDialog(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={() => { const id = dialog.order.id; setDialog(null); router.push(`/purchases/new?from_so=${id}&scope=${poScope}`) }}>Yes, create</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
