'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type SalesOrder = {
  id: string
  so_number: string | null
  status: string
  order_date: string | null
  total_amount: number | null
  customer_name: string | null
  location_id: string | null
  expected_date: string | null
  shipped_date: string | null
}

type PurchaseOrder = {
  id: string
  po_number: string | null
  status: string
  order_date: string | null
  total_amount: number | null
  supplier_name: string | null
  expected_date: string | null
}

type StockLevel = {
  product_id: string
  location_id: string
  quantity: number
  on_order: number
  committed: number
}

type Product = {
  id: string
  name: string
  sku: string | null
  type: string
  sell_price: number | null
  cost_price: number | null
  avg_cost: number | null
  low_stock_threshold: number | null
  is_active: boolean | null
  track_stock: boolean | null
}

type Location = { id: string; name: string }

function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function fmtFull(n: number | null) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

function soStatusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'open') return <span className="badge badge-open" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'picking') return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6', fontSize: 11 }}>{status}</span>
  if (s === 'shipped') return <span className="badge badge-partial" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'delivered') return <span className="badge badge-closed" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled" style={{ fontSize: 11 }}>{status}</span>
  return <span className="badge badge-draft" style={{ fontSize: 11 }}>{status}</span>
}

function poStatusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'draft') return <span className="badge badge-draft" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'open') return <span className="badge badge-open" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'partially received') return <span className="badge badge-partial" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'closed') return <span className="badge badge-closed" style={{ fontSize: 11 }}>{status}</span>
  if (s === 'cancelled') return <span className="badge badge-cancelled" style={{ fontSize: 11 }}>{status}</span>
  return <span className="badge badge-draft" style={{ fontSize: 11 }}>{status}</span>
}

export default function DashboardClient({
  salesOrders,
  purchaseOrders,
  stockLevels,
  products,
  locations,
  displayName,
  orgName,
  thisMonthStart,
  lastMonthStart,
  lastMonthEnd,
}: {
  salesOrders: SalesOrder[]
  purchaseOrders: PurchaseOrder[]
  stockLevels: StockLevel[]
  products: Product[]
  locations: Location[]
  displayName: string
  orgName: string
  thisMonthStart: string
  lastMonthStart: string
  lastMonthEnd: string
}) {
  const router = useRouter()
  const [locFilter, setLocFilter] = useState('')
  const [locOpen, setLocOpen] = useState(false)

  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Stock map
  const stockMap = useMemo(() => {
    const map: Record<string, { onHand: number; onOrder: number; committed: number; byLocation: Record<string, number> }> = {}
    for (const s of stockLevels) {
      if (!map[s.product_id]) map[s.product_id] = { onHand: 0, onOrder: 0, committed: 0, byLocation: {} }
      if (!locFilter || s.location_id === locFilter) {
        map[s.product_id].onHand += s.quantity
        map[s.product_id].onOrder += s.on_order
        map[s.product_id].committed += s.committed
      }
      map[s.product_id].byLocation[s.location_id] = (map[s.product_id].byLocation[s.location_id] ?? 0) + s.quantity
    }
    return map
  }, [stockLevels, locFilter])

  // Filtered SOs
  const filteredSOs = useMemo(() =>
    locFilter ? salesOrders.filter(s => s.location_id === locFilter) : salesOrders,
    [salesOrders, locFilter]
  )

  // KPIs
  const kpis = useMemo(() => {
    const openSOs = filteredSOs.filter(s => !['delivered', 'cancelled', 'draft'].includes(s.status.toLowerCase()))
    const soVal = openSOs.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)

    const revThisMonth = filteredSOs
      .filter(s => s.status.toLowerCase() === 'delivered' && s.order_date && s.order_date >= thisMonthStart)
      .reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
    const revLastMonth = filteredSOs
      .filter(s => s.status.toLowerCase() === 'delivered' && s.order_date && s.order_date >= lastMonthStart && s.order_date <= lastMonthEnd)
      .reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
    const revDelta = revLastMonth > 0 ? ((revThisMonth - revLastMonth) / revLastMonth * 100).toFixed(1) : null

    const openPOs = purchaseOrders.filter(p => ['open', 'partially received'].includes(p.status.toLowerCase()))
    const incomingVal = openPOs.reduce((sum, p) => sum + (p.total_amount ?? 0), 0)

    const stockProds = products.filter(p => p.type === 'Stock' && p.track_stock)
    const invVal = stockProds.reduce((sum, p) => {
      const oh = stockMap[p.id]?.onHand ?? 0
      return sum + oh * (p.avg_cost ?? p.cost_price ?? 0)
    }, 0)

    const nonDraft = filteredSOs.filter(s => s.status.toLowerCase() !== 'draft')
    const fillRate = nonDraft.length ? Math.round(filteredSOs.filter(s => s.status.toLowerCase() === 'delivered').length / nonDraft.length * 100) : 100

    return { openSOs, soVal, revThisMonth, revDelta, openPOs, incomingVal, invVal, fillRate }
  }, [filteredSOs, purchaseOrders, products, stockMap, thisMonthStart, lastMonthStart, lastMonthEnd])

  // 6-month sales trend
  const salesTrend = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const monthStart = d.toISOString().split('T')[0]
      const monthEnd = nextD.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-NZ', { month: 'short' })
      const monthSOs = filteredSOs.filter(s => s.order_date && s.order_date >= monthStart && s.order_date < monthEnd && s.status.toLowerCase() !== 'cancelled')
      const val = monthSOs.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
      months.push({ label, val, isLast: i === 0 })
    }
    return months
  }, [filteredSOs, now])

  // Inventory health
  const invHealth = useMemo(() => {
    const stockProds = products.filter(p => p.type === 'Stock' && p.track_stock)
    const inStock = stockProds.filter(p => {
      const oh = stockMap[p.id]?.onHand ?? 0
      return oh > 0 && (!p.low_stock_threshold || oh >= p.low_stock_threshold)
    }).length
    const lowStock = stockProds.filter(p => {
      const oh = stockMap[p.id]?.onHand ?? 0
      return oh > 0 && p.low_stock_threshold && oh < p.low_stock_threshold
    }).length
    const outStock = stockProds.filter(p => (stockMap[p.id]?.onHand ?? 0) <= 0).length
    return { inStock, lowStock, outStock, total: stockProds.length }
  }, [products, stockMap])

  // No stock products
  const noStockProds = useMemo(() =>
    products.filter(p => p.type === 'Stock' && p.track_stock && (stockMap[p.id]?.onHand ?? 0) <= 0).slice(0, 6),
    [products, stockMap]
  )

  // Recent SOs
  const recentSOs = useMemo(() =>
    [...filteredSOs].sort((a, b) => (b.order_date ?? '').localeCompare(a.order_date ?? '')).slice(0, 6),
    [filteredSOs]
  )

  // Recent POs
  const recentPOs = useMemo(() =>
    [...purchaseOrders].slice(0, 6),
    [purchaseOrders]
  )

  // Chart dimensions
  const W = 440, H = 140, pad = 32, barW = 48, gap = 14
  const maxV = Math.max(...salesTrend.map(m => m.val), 1)

  // Donut
  const r = 68, cx = 90, cy = 90, sw = 22
  const circum = 2 * Math.PI * r
  const invSegments = [
    { label: 'In Stock', count: invHealth.inStock, color: '#0d9488' },
    { label: 'Low Stock', count: invHealth.lowStock, color: '#F59E0B' },
    { label: 'Out of Stock', count: invHealth.outStock, color: '#EF4444' },
  ].filter(s => s.count > 0)
  const total = invHealth.total || 1
  let arcOffset = 0
  const arcs = invSegments.map(s => {
    const pct = s.count / total
    const dash = pct * circum
    const arc = { ...s, dash, offset: arcOffset, pct: Math.round(pct * 100) }
    arcOffset += dash
    return arc
  })

  const locName = locations.find(l => l.id === locFilter)?.name ?? 'All Locations'

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#F4F6F9', padding: '24px 28px 40px' }} onClick={() => setLocOpen(false)}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.03em' }}>Dashboard</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{dateLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button className="filter-dd-btn" style={{ height: 36, minWidth: 160 }} onClick={() => setLocOpen(o => !o)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{locName}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {locOpen && (
              <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 190, right: 0 }}>
                <div className="col-dropdown-title">Location</div>
                <div className={`fp-item${!locFilter ? ' active' : ''}`} onClick={() => { setLocFilter(''); setLocOpen(false) }}>All Locations</div>
                {locations.map(l => (
                  <div key={l.id} className={`fp-item${locFilter === l.id ? ' active' : ''}`} onClick={() => { setLocFilter(l.id); setLocOpen(false) }}>{l.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          {
            label: 'Total Stock Value', val: fmt(kpis.invVal),
            delta: kpis.revDelta != null ? `${Number(kpis.revDelta) >= 0 ? '↑' : '↓'} ${Math.abs(Number(kpis.revDelta))}% vs last month` : 'across all locations',
            up: kpis.revDelta == null || Number(kpis.revDelta) >= 0, bg: '#0d9488',
            icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
          },
          {
            label: 'Open Sales Orders', val: String(kpis.openSOs.length),
            delta: `${fmtFull(kpis.soVal)} total value`,
            up: true, bg: '#0EA5E9',
            icon: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
          },
          {
            label: 'Incoming Stock (POs)', val: fmt(kpis.incomingVal),
            delta: `${kpis.openPOs.length} open order${kpis.openPOs.length !== 1 ? 's' : ''}`,
            up: true, bg: '#F59E0B',
            icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
          },
          {
            label: 'Fill Rate', val: `${kpis.fillRate}%`,
            delta: 'orders fulfilled',
            up: kpis.fillRate >= 80, bg: '#10B981',
            icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
          },
          {
            label: 'Out of Stock SKUs', val: String(invHealth.outStock),
            delta: `of ${invHealth.total} tracked SKUs`,
            up: invHealth.outStock === 0, bg: '#EF4444',
            icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
          },
        ].map((k, i) => (
          <div key={i} className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.bg, borderRadius: '14px 14px 0 0' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, marginTop: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-400)', lineHeight: 1.3 }}>{k.label}</div>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: k.bg + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={k.bg} strokeWidth="2">
                  {k.icon.split('M').filter(Boolean).map((d, j) => <path key={j} d={`M${d}`} />)}
                </svg>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--slate)', letterSpacing: '-0.03em', lineHeight: 1 }}>{k.val}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: k.up ? 'var(--teal)' : 'var(--danger)' }}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Sales Trend + Inventory Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Sales Trend */}
        <div className="dash-card">
          <div className="dash-card-title">
            Sales Trend <span className="dash-card-sub">Last 6 months · order value</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H + 10}`} width="100%" style={{ overflow: 'visible' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(pct => {
              const y = H - 20 - pct * (H - 30)
              const val = maxV * pct
              return (
                <g key={pct}>
                  <line x1={pad - 4} y1={y} x2={W - 8} y2={y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3,3" />
                  <text x={pad - 6} y={y + 3} textAnchor="end" fontSize="8.5" fill="#94a3b8" fontFamily="sans-serif">{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : Math.round(val)}</text>
                </g>
              )
            })}
            {salesTrend.map((m, i) => {
              const bh = Math.max(4, (m.val / maxV) * (H - 30))
              const x = pad + i * (barW + gap)
              const y = H - bh - 20
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barW} height={bh} rx="5" fill={m.isLast ? '#0d9488' : '#0d948825'} />
                  <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="sans-serif">{m.label}</text>
                  {m.val > 0 && <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="8" fill={m.isLast ? '#0d9488' : '#94a3b8'} fontWeight={m.isLast ? 700 : 400} fontFamily="sans-serif">{fmt(m.val)}</text>}
                </g>
              )
            })}
          </svg>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--gray-100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-400)' }}><div style={{ width: 10, height: 10, borderRadius: 3, background: '#0d9488' }} />Current month</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-400)' }}><div style={{ width: 10, height: 10, borderRadius: 3, background: '#0d948825', border: '1px solid #0d948860' }} />Previous months</div>
          </div>
        </div>

        {/* Inventory Health */}
        <div className="dash-card">
          <div className="dash-card-title">
            Inventory Health <span className="dash-card-sub">{invHealth.total} SKUs</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 20, flex: 1 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 180 180" style={{ height: '100%', minHeight: 160, maxHeight: 200, width: 'auto' }}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={sw} />
                {arcs.map((a, i) => (
                  <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                    stroke={a.color} strokeWidth={sw - 3}
                    strokeDasharray={`${Math.max(0, a.dash - 3)} ${circum - Math.max(0, a.dash - 3)}`}
                    strokeDashoffset={circum - a.offset}
                    transform={`rotate(-90 ${cx} ${cy})`}
                  />
                ))}
                <text x={cx} y={cy - 10} textAnchor="middle" fontSize="30" fontWeight="800" fill="#1e293b" fontFamily="var(--font-display)">{invHealth.inStock}</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="#94a3b8" fontFamily="sans-serif">IN STOCK</text>
                <text x={cx} y={cy + 24} textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="sans-serif">{invHealth.total} total</text>
              </svg>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
              {invSegments.map((s, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--gray-400)', fontWeight: 500 }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>{s.count} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--gray-400)' }}>({Math.round(s.count / total * 100)}%)</span></span>
                  </div>
                  <div style={{ height: 5, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: 5, width: `${Math.round(s.count / total * 100)}%`, background: s.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Recent SOs + Recent POs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Recent Sales Orders */}
        <div className="dash-card">
          <div className="dash-card-title">
            Recent Sales Orders
            <Link href="/sales" style={{ fontSize: 12, fontWeight: 500, color: 'var(--teal)', textDecoration: 'none' }}>View all →</Link>
          </div>
          {recentSOs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No sales orders yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <th style={{ textAlign: 'left', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Order</th>
                  <th style={{ textAlign: 'left', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Customer</th>
                  <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSOs.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--gray-100)', cursor: 'pointer' }} onClick={() => router.push(`/sales/${o.id}`)}>
                    <td style={{ padding: '9px 0' }}>
                      <div style={{ fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{o.so_number ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{fmtDate(o.order_date)}</div>
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--gray-400)', fontSize: 12.5 }}>{o.customer_name ?? '—'}</td>
                    <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{fmtFull(o.total_amount)}</td>
                    <td style={{ padding: '9px 0 9px 8px', textAlign: 'right' }}>{soStatusBadge(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Purchase Orders */}
        <div className="dash-card">
          <div className="dash-card-title">
            Recent Purchase Orders
            <Link href="/purchases" style={{ fontSize: 12, fontWeight: 500, color: 'var(--teal)', textDecoration: 'none' }}>View all →</Link>
          </div>
          {recentPOs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No purchase orders yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <th style={{ textAlign: 'left', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Order</th>
                  <th style={{ textAlign: 'left', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Supplier</th>
                  <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPOs.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--gray-100)', cursor: 'pointer' }} onClick={() => router.push(`/purchases/${o.id}`)}>
                    <td style={{ padding: '9px 0' }}>
                      <div style={{ fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{o.po_number ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{fmtDate(o.order_date)}</div>
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--gray-400)', fontSize: 12.5 }}>{o.supplier_name ?? '—'}</td>
                    <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{fmtFull(o.total_amount)}</td>
                    <td style={{ padding: '9px 0 9px 8px', textAlign: 'right' }}>{poStatusBadge(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 3: No Stock + Attention */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* No Stock Products */}
        <div className="dash-card">
          <div className="dash-card-title">
            Out of Stock
            <Link href="/products" style={{ fontSize: 12, fontWeight: 500, color: 'var(--teal)', textDecoration: 'none' }}>View all →</Link>
          </div>
          {noStockProds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
              All products are in stock
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {noStockProds.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, cursor: 'pointer' }} onClick={() => router.push('/products')}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{p.name}</div>
                    {p.sku && <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{p.sku}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '2px 8px', borderRadius: 20 }}>No Stock</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attention Items */}
        <div className="dash-card">
          <div className="dash-card-title">Needs Attention</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Overdue SOs */}
            {(() => {
              const overdue = filteredSOs.filter(s => s.expected_date && new Date(s.expected_date) < now && !['delivered', 'cancelled'].includes(s.status.toLowerCase()))
              return overdue.length > 0 ? (
                <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10 }}>
                  <div style={{ fontWeight: 700, color: '#991B1B', fontSize: 13 }}>⚠ {overdue.length} Overdue Sales Order{overdue.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 2 }}>Expected delivery date has passed</div>
                  <Link href="/sales" style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600, marginTop: 4, display: 'inline-block' }}>View orders →</Link>
                </div>
              ) : null
            })()}
            {/* Overdue POs */}
            {(() => {
              const overduePOs = purchaseOrders.filter(p => p.expected_date && new Date(p.expected_date) < now && ['open', 'partially received'].includes(p.status.toLowerCase()))
              return overduePOs.length > 0 ? (
                <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1.5px solid #FDE68A', borderRadius: 10 }}>
                  <div style={{ fontWeight: 700, color: '#92400E', fontSize: 13 }}>⚠ {overduePOs.length} Overdue Purchase Order{overduePOs.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>Expected delivery date has passed</div>
                  <Link href="/purchases" style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600, marginTop: 4, display: 'inline-block' }}>View orders →</Link>
                </div>
              ) : null
            })()}
            {/* Low stock */}
            {invHealth.lowStock > 0 && (
              <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, color: '#92400E', fontSize: 13 }}>⚠ {invHealth.lowStock} Low Stock SKU{invHealth.lowStock > 1 ? 's' : ''}</div>
                <div style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>Products below minimum stock threshold</div>
                <Link href="/products" style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600, marginTop: 4, display: 'inline-block' }}>View products →</Link>
              </div>
            )}
            {/* All good */}
            {filteredSOs.filter(s => s.expected_date && new Date(s.expected_date) < now && !['delivered', 'cancelled'].includes(s.status.toLowerCase())).length === 0 &&
              purchaseOrders.filter(p => p.expected_date && new Date(p.expected_date) < now && ['open', 'partially received'].includes(p.status.toLowerCase())).length === 0 &&
              invHealth.lowStock === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
                  Everything looks good
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}
