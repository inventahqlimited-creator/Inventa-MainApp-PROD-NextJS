'use client'

import { useState, useMemo } from 'react'

type Product = {
  id: string
  name: string
  sku: string | null
  description: string | null
  type: string
  unit: string | null
  sell_price: number | null
  cost_price: number | null
  is_active: boolean | null
  track_stock: boolean | null
  low_stock_threshold: number | null
  barcode: string | null
  default_supplier_id: string | null
  last_cost: number | null
  avg_cost: number | null
  batch_tracking: boolean | null
  serial_tracking: boolean | null
  expiry_tracking: boolean | null
}

type StockLevel = {
  product_id: string
  location_id: string
  quantity: number
  on_order: number
  committed: number
  on_hold: number
  reserved_quantity: number
}

type Location = {
  id: string
  name: string
}

function fmt(n: number | null | undefined, prefix = '$') {
  if (n == null) return '—'
  return `${prefix}${Number(n).toFixed(2)}`
}

function stockBadge(onHand: number, threshold: number | null) {
  if (onHand <= 0) return <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>No Stock</span>
  if (threshold && onHand <= threshold) return <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>Low</span>
  return <span className="badge" style={{ background: '#D1FAE5', color: '#065F46' }}>In Stock</span>
}

function typeBadge(type: string) {
  if (type === 'NonStock') return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Non-Stock</span>
  if (type === 'Service') return <span className="badge" style={{ background: '#DBEAFE', color: '#1E40AF' }}>Service</span>
  return <span className="badge" style={{ background: 'var(--teal-pale)', color: '#0B7A6E' }}>Stock</span>
}

export default function ProductsTable({
  products,
  stockLevels,
  locations,
  orgId,
  isAdmin,
}: {
  products: Product[]
  stockLevels: StockLevel[]
  locations: Location[]
  orgId: string
  isAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tab, setTab] = useState<'all' | 'instock' | 'nostock'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  // Aggregate stock per product
  const stockMap = useMemo(() => {
    const map: Record<string, { onHand: number; onOrder: number; committed: number; onHold: number; available: number }> = {}
    for (const s of stockLevels) {
      if (!map[s.product_id]) map[s.product_id] = { onHand: 0, onOrder: 0, committed: 0, onHold: 0, available: 0 }
      map[s.product_id].onHand += s.quantity
      map[s.product_id].onOrder += s.on_order
      map[s.product_id].committed += s.committed
      map[s.product_id].onHold += s.on_hold
    }
    for (const id in map) {
      map[id].available = map[id].onHand - map[id].committed - map[id].onHold
    }
    return map
  }, [stockLevels])

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!showInactive && !p.is_active) return false
      if (typeFilter && p.type !== typeFilter) return false
      const stock = stockMap[p.id]
      const onHand = stock?.onHand ?? 0
      if (tab === 'instock' && onHand <= 0) return false
      if (tab === 'nostock' && onHand > 0) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [products, search, typeFilter, tab, showInactive, stockMap])

  const counts = useMemo(() => ({
    all: products.filter(p => showInactive || p.is_active).length,
    instock: products.filter(p => (showInactive || p.is_active) && (stockMap[p.id]?.onHand ?? 0) > 0).length,
    nostock: products.filter(p => (showInactive || p.is_active) && (stockMap[p.id]?.onHand ?? 0) <= 0).length,
  }), [products, showInactive, stockMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Products</div>
            <div className="page-subtitle">Stock items, non-stock and services</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Product
            </button>
          </div>
        </div>
        <div className="tab-bar">
          {([
            { key: 'all', label: 'All' },
            { key: 'instock', label: 'In Stock' },
            { key: 'nostock', label: 'No Stock' },
          ] as const).map(t => (
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
      <div className="filter-bar-card">
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="filter-search"
            placeholder="Search products…"
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
              {[
                { value: '', label: 'All Types' },
                { value: 'Stock', label: 'Stock' },
                { value: 'NonStock', label: 'Non-Stock' },
                { value: 'Service', label: 'Service' },
              ].map(opt => (
                <div
                  key={opt.value}
                  className={`fp-item${typeFilter === opt.value ? ' active' : ''}`}
                  onClick={() => { setTypeFilter(opt.value); setPage(1); setTypeOpen(false) }}
                >
                  {opt.label}
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
          <strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> products
        </span>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Status</th>
                <th>Unit</th>
                <th style={{ textAlign: 'right' }}>Sale Price</th>
                <th style={{ textAlign: 'right' }}>On Hand</th>
                <th style={{ textAlign: 'right' }}>On Order</th>
                <th style={{ textAlign: 'right' }}>Committed</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No products match your search.' : 'No products yet. Add one to get started.'}
                  </td>
                </tr>
              )}
              {paginated.map(p => {
                const stock = stockMap[p.id] ?? { onHand: 0, onOrder: 0, committed: 0, onHold: 0, available: 0 }
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--slate)', letterSpacing: '-0.01em' }}>
                        {p.name}
                      </div>
                      {p.sku && (
                        <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace', marginTop: 1 }}>
                          {p.sku}
                        </div>
                      )}
                    </td>
                    <td>{typeBadge(p.type)}</td>
                    <td>
                      {p.is_active
                        ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46' }}>Active</span>
                        : <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>Inactive</span>
                      }
                    </td>
                    <td className="td-muted">{p.unit ?? '—'}</td>
                    <td style={{ textAlign: 'right' }} className="td-muted">{fmt(p.sell_price)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {p.track_stock ? (
                        <span style={{ fontWeight: 600, color: stock.onHand <= 0 ? 'var(--danger)' : 'var(--slate)' }}>
                          {stock.onHand}
                        </span>
                      ) : <span className="td-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }} className="td-muted">{p.track_stock ? stock.onOrder : '—'}</td>
                    <td style={{ textAlign: 'right' }} className="td-muted">{p.track_stock ? stock.committed : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {p.track_stock ? (
                        <span style={{ fontWeight: 600, color: stock.available <= 0 ? 'var(--danger)' : '#059669' }}>
                          {stock.available}
                        </span>
                      ) : <span className="td-muted">—</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="row-action-btn" title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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
    </div>
  )
}
