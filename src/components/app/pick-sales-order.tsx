'use client'

// src/components/app/pick-sales-order.tsx
// Pick screen — one or several orders. By Order / By Product, Auto Pick (when enabled in Settings),
// and a side panel to choose stock by bin / batch / expiry / serial.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Part = { group_id: string | null; available: number }
type Stock = {
  key: string
  bin: string | null
  batch: string | null
  serial: string | null
  expiry: string | null
  created_at: string
  parts: Part[] // the stock groups (and any un-grouped stock) that make up this row
}
type Alloc = { group_id: string | null; qty: number }
type Line = {
  id: string
  order_id: string
  product_id: string
  location_id: string
  name: string
  sku: string
  unit: string
  ordered: number
  onHand: number
  tracking: { batch: boolean; serial: boolean; expiry: boolean }
  stock: Stock[]
  picks: Alloc[]
  legacyPicked: number
}
type Order = { id: string; so_number: string; customer_name: string; location_name: string; status: string }

const sum = (a: Alloc[]) => a.reduce((s, x) => s + x.qty, 0)

export default function PickSalesOrder({
  orders, lines, allowOverPicking, autoPicking, pickingRule, fulfilmentMode,
}: {
  orders: Order[]
  lines: Line[]
  allowOverPicking: boolean
  autoPicking: boolean
  pickingRule: 'FIFO' | 'LIFO' | 'FEFO'
  fulfilmentMode: string
}) {
  const router = useRouter()
  const single = orders.length === 1
  const backTo = single ? `/sales/${orders[0].id}` : '/sales'
  const orderOf = (l: Line) => orders.find(o => o.id === l.order_id) as Order

  const [grouping, setGrouping] = useState<'order' | 'product'>('order')
  const [allocs, setAllocs] = useState<Record<string, Alloc[]>>(() => Object.fromEntries(lines.map(l => [l.id, l.picks])))
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [panelLine, setPanelLine] = useState<string | null>(null)
  const [panelQty, setPanelQty] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const pickedOf = (l: Line) => (dirty.has(l.id) || l.picks.length ? sum(allocs[l.id] ?? []) : l.legacyPicked)
  const capOf = (l: Line) => (allowOverPicking ? Infinity : l.ordered)

  // Stock already taken by OTHER lines on this screen (same product, same location) — so two orders can't pick the same unit
  const takenByOthers = (l: Line, groupId: string | null, map: Record<string, Alloc[]>) => {
    let t = 0
    for (const m of lines) {
      if (m.id === l.id || m.product_id !== l.product_id || m.location_id !== l.location_id) continue
      for (const a of map[m.id] ?? []) if (a.group_id === groupId) t += a.qty
    }
    return t
  }
  const partAvail = (l: Line, p: Part, map: Record<string, Alloc[]>) => Math.max(p.available - takenByOthers(l, p.group_id, map), 0)
  const availOf = (l: Line, s: Stock, map: Record<string, Alloc[]> = allocs) => s.parts.reduce((t, p) => t + partAvail(l, p, map), 0)

  // Oldest-first (or the picking rule) ordering of a line's stock
  function ordered(l: Line): Stock[] {
    const rows = [...l.stock]
    const loose = (s: Stock) => (s.parts.every(p => p.group_id === null) ? 1 : 0)
    rows.sort((a, b) => {
      if (loose(a) !== loose(b)) return loose(a) - loose(b)
      if (pickingRule === 'FEFO') {
        const ea = a.expiry ?? '9999-12-31', eb = b.expiry ?? '9999-12-31'
        if (ea !== eb) return ea < eb ? -1 : 1
      }
      if (a.created_at === b.created_at) return 0
      const asc = a.created_at < b.created_at ? -1 : 1
      return pickingRule === 'LIFO' ? -asc : asc
    })
    return rows
  }

  function allocate(l: Line, qty: number, map: Record<string, Alloc[]> = allocs): Alloc[] {
    let left = Math.max(qty, 0)
    const out: Alloc[] = []
    for (const s of ordered(l)) {
      for (const p of s.parts) {
        if (left <= 0) break
        const take = Math.min(left, partAvail(l, p, map))
        if (take > 0) { out.push({ group_id: p.group_id, qty: take }); left -= take }
      }
    }
    return out
  }

  function setLine(l: Line, next: Alloc[]) {
    setAllocs(a => ({ ...a, [l.id]: next }))
    setDirty(d => new Set(d).add(l.id))
  }

  function typeQty(l: Line, raw: string) {
    let q = parseFloat(raw)
    if (!Number.isFinite(q) || q < 0) q = 0
    q = Math.min(q, capOf(l))
    setLine(l, allocate(l, q))
  }

  // Only offered when "Auto picking" is switched on in Settings
  function autoPick() {
    const cur = { ...allocs }
    const d = new Set(dirty)
    for (const l of lines) {
      if (l.onHand <= 0) continue
      const room = l.stock.reduce((s, x) => s + availOf(l, x, cur), 0)
      cur[l.id] = allocate(l, Math.min(l.ordered, room), cur)
      d.add(l.id)
    }
    setAllocs(cur)
    setDirty(d)
  }

  const status = (l: Line): 'no-stock' | 'available' | 'picked' | 'partial' | 'over' => {
    const p = pickedOf(l)
    if (l.onHand <= 0 && p <= 0) return 'no-stock'
    if (p <= 0) return 'available'
    if (p > l.ordered) return 'over'
    return p >= l.ordered ? 'picked' : 'partial'
  }
  const badge = (l: Line) => {
    const map = {
      'no-stock': ['#FEE2E2', 'var(--danger)', 'No Stock'],
      available: ['var(--gray-100)', 'var(--gray-400)', 'Available'],
      picked: ['#D1FAE5', '#065F46', 'Picked'],
      partial: ['#FEF3C7', '#92400E', 'Partially Picked'],
      over: ['#FEF3C7', '#92400E', 'Over Picked'],
    } as const
    const [bg, color, label] = map[status(l)]
    return <span className="badge" style={{ background: bg, color, fontSize: 11 }}>{label}</span>
  }

  const stockOf = (l: Line, g: string | null) => l.stock.find(s => s.parts.some(p => p.group_id === g))
  function allocTags(l: Line) {
    // one tag per stock row (bin / batch / expiry / serial), quantities combined
    const byRow = new Map<string, { s: Stock | undefined; qty: number }>()
    for (const x of allocs[l.id] ?? []) {
      const s = stockOf(l, x.group_id)
      const k = s?.key ?? `g-${x.group_id ?? 'loose'}`
      const e = byRow.get(k) ?? { s, qty: 0 }
      e.qty += x.qty
      byRow.set(k, e)
    }
    if (!byRow.size) return <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>
    return [...byRow.values()].map((x, i) => {
      const tags = [x.s?.bin, x.s?.batch, x.s?.expiry, x.s?.serial].filter(Boolean)
      return (
        <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--teal-surface)', border: '1px solid var(--teal-pale)', borderRadius: 6, padding: '2px 7px', margin: '2px 2px 0 0', fontSize: 11.5, color: 'var(--teal)', fontWeight: 600 }}>
          {tags.join(' · ') || 'Default'} <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>×{x.qty}</span>
        </div>
      )
    })
  }

  // ── Side panel ──
  const panel = lines.find(l => l.id === panelLine) ?? null
  function openPanel(l: Line) {
    const q: Record<string, number> = {}
    for (const a of allocs[l.id] ?? []) {
      const s = stockOf(l, a.group_id)
      if (s) q[s.key] = (q[s.key] ?? 0) + a.qty
    }
    setPanelQty(q)
    setPanelLine(l.id)
  }
  function applyPanel() {
    if (!panel) return
    const next: Alloc[] = []
    let room = capOf(panel) // never pick more than ordered unless over-picking is on in Settings
    for (const s of ordered(panel)) {
      let want = Math.min(panelQty[s.key] ?? 0, room)
      for (const p of s.parts) {
        if (want <= 0) break
        const q = Math.min(want, partAvail(panel, p, allocs))
        if (q > 0) { next.push({ group_id: p.group_id, qty: q }); want -= q; room -= q }
      }
    }
    setLine(panel, next)
    setPanelLine(null)
  }
  const panelTotal = Object.values(panelQty).reduce((s, x) => s + (x || 0), 0)

  // ── Totals ──
  const totalOrdered = lines.reduce((s, l) => s + l.ordered, 0)
  const totalPicked = lines.reduce((s, l) => s + Math.min(pickedOf(l), l.ordered), 0)
  const anyPartial = lines.some(l => pickedOf(l) < l.ordered)
  const anyDirty = dirty.size > 0

  function askConfirm() {
    setError(null)
    if (!anyDirty && !lines.some(l => pickedOf(l) > 0)) { setError('Pick at least one item before confirming.'); return }
    setConfirm(true)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    const saved = new Set<string>()
    let last: { new_status?: string; all_picked?: boolean } = {}
    try {
      for (const o of orders) {
        const mine = lines.filter(l => l.order_id === o.id && dirty.has(l.id))
        if (mine.length === 0) continue
        const res = await fetch(`/api/org/sales/${o.id}/pick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: mine.map(l => ({ line_id: l.id, picks: allocs[l.id] ?? [] })) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setConfirm(false)
          // orders already saved are no longer "changed"
          setDirty(d => { const n = new Set(d); lines.filter(l => saved.has(l.order_id)).forEach(l => n.delete(l.id)); return n })
          setError(`${o.so_number}: ${data.error ?? 'Could not save this pick'}${saved.size ? ` (${saved.size} order${saved.size !== 1 ? 's were' : ' was'} already saved)` : ''}`)
          return
        }
        saved.add(o.id)
        last = data
      }
      if (single) {
        // Full mode: a freshly fully-picked order goes on to the Pack screen (a Packed order goes back to its page)
        if (last.all_picked && last.new_status === 'Picked' && fulfilmentMode === 'full') { router.push(`/sales/${orders[0].id}/pack`); return }
        router.push(`/sales/${orders[0].id}`)
      } else {
        router.push('/sales')
      }
      router.refresh()
    } catch {
      setConfirm(false)
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const th = (label: string, w?: number, align: 'left' | 'right' | 'center' = 'left') => (
    <th className="li-th" style={{ width: w, textAlign: align }}>{label}</th>
  )

  const pickedInput = (l: Line) => {
    const noStock = status(l) === 'no-stock'
    return (
      <input
        type="number" min={0} max={allowOverPicking ? undefined : l.ordered}
        value={pickedOf(l)} disabled={noStock}
        onChange={e => typeQty(l, e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{ width: 64, padding: '4px 8px', border: '1.5px solid var(--gray-200)', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'right', background: noStock ? 'var(--gray-50)' : 'var(--white)', outline: 'none', fontFamily: 'var(--font-ui)' }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--gray-200)')}
      />
    )
  }
  const panelBtn = (l: Line) => status(l) === 'no-stock' ? null : (
    <button onClick={e => { e.stopPropagation(); openPanel(l) }} title={pickedOf(l) > 0 ? 'Edit pick' : 'Select stock'} className={`pick-action-btn${pickedOf(l) > 0 ? ' pick-action-btn--active' : ''}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    </button>
  )
  const cell = { padding: '10px 12px' } as const

  const confirmMsg = !single
    ? `Save the picks for ${orders.length} orders. Fully picked orders move to Picked; the rest stay in Picking so you can finish them later.`
    : orders[0].status.toLowerCase() === 'packed'
      ? 'This order is Packed. If everything stays fully picked it remains Packed; if you reduce a pick, the cartons are trimmed to match and the order goes back to Picking.'
      : fulfilmentMode === 'pick-only' && !anyPartial
        ? `This will record the pick and close ${orders[0].so_number} — stock leaves ${orders[0].location_name}.`
        : anyPartial
          ? 'Some lines are not fully picked. The order will stay in Picking so you can finish it later.'
          : fulfilmentMode === 'full'
            ? 'Everything is picked. Next you\'ll pack the order into cartons.'
            : 'The order will move to Picked with everything picked.'

  const productGroups = Array.from(new Set(lines.map(l => l.product_id))).map(pid => lines.filter(l => l.product_id === pid))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push(backTo)} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>{single ? 'Pick Order' : 'Pick Orders'}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>{orders.length} order{orders.length !== 1 ? 's' : ''} · {lines.length} line{lines.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--gray-100)', borderRadius: 9, padding: 3 }}>
            <button className={`seg-tab${grouping === 'order' ? ' active' : ''}`} onClick={() => setGrouping('order')}>By Order</button>
            <button className={`seg-tab${grouping === 'product' ? ' active' : ''}`} onClick={() => setGrouping('product')}>By Product</button>
          </div>
          {autoPicking && (
            <button onClick={autoPick} className="btn btn-outline" style={{ height: 36 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Auto Pick
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 100px' }}>
          {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
          {lines.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>There are no stocked items to pick.</div>
          )}

          {lines.length > 0 && grouping === 'order' && orders.map(o => {
            const ol = lines.filter(l => l.order_id === o.id)
            if (ol.length === 0) return null
            return (
              <div key={o.id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>{o.so_number}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>{o.customer_name}{!single && o.location_name ? ` · ${o.location_name}` : ''}</div>
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'var(--gray-50)' }}>
                      {th('Product')}{th('Unit', 70, 'center')}{th('Ordered', 80, 'right')}{th('Picked', 90, 'right')}{th('Bins', 140)}{th('Status', 130)}{th('', 40)}
                    </tr></thead>
                    <tbody>
                      {ol.map(l => (
                        <tr key={l.id} onClick={() => status(l) !== 'no-stock' && openPanel(l)} style={{ borderBottom: '1px solid var(--gray-50)', cursor: status(l) === 'no-stock' ? 'default' : 'pointer', background: panelLine === l.id ? 'var(--teal-surface)' : undefined }}>
                          <td style={{ ...cell, fontSize: 13, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>
                            {l.name}{l.sku && <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>{l.sku}</div>}
                          </td>
                          <td style={{ ...cell, textAlign: 'center', fontSize: 12, color: 'var(--gray-400)' }}>{l.unit}</td>
                          <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{l.ordered}</td>
                          <td style={{ ...cell, textAlign: 'right' }}>{pickedInput(l)}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 200 }}>{allocTags(l)}</td>
                          <td style={cell}>{badge(l)}</td>
                          <td style={{ ...cell, textAlign: 'center' }}>{panelBtn(l)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {lines.length > 0 && grouping === 'product' && productGroups.map(pl => {
            const first = pl[0]
            const pOrdered = pl.reduce((s, l) => s + l.ordered, 0)
            const pPicked = pl.reduce((s, l) => s + Math.min(pickedOf(l), l.ordered), 0)
            return (
              <div key={first.product_id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--slate)' }}>{first.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{first.sku}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Total: <strong>{pPicked} / {pOrdered}</strong> {first.unit}</div>
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'var(--gray-50)' }}>
                      {th('Order')}{th('Customer')}{th('Ordered', 80, 'right')}{th('Picked', 90, 'right')}{th('Bins', 140)}{th('Status', 130)}{th('', 40)}
                    </tr></thead>
                    <tbody>
                      {pl.map(l => (
                        <tr key={l.id} onClick={() => status(l) !== 'no-stock' && openPanel(l)} style={{ borderBottom: '1px solid var(--gray-50)', cursor: status(l) === 'no-stock' ? 'default' : 'pointer', background: panelLine === l.id ? 'var(--teal-surface)' : undefined }}>
                          <td style={{ ...cell, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>{orderOf(l).so_number}</td>
                          <td style={{ ...cell, fontSize: 13, color: 'var(--gray-400)' }}>{orderOf(l).customer_name}</td>
                          <td style={{ ...cell, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{l.ordered}</td>
                          <td style={{ ...cell, textAlign: 'right' }}>{pickedInput(l)}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 200 }}>{allocTags(l)}</td>
                          <td style={cell}>{badge(l)}</td>
                          <td style={{ ...cell, textAlign: 'center' }}>{panelBtn(l)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>

        {/* Stock side panel */}
        {panel && (
          <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--gray-100)', background: 'var(--white)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--slate)' }}>{panel.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{single ? '' : `${orderOf(panel).so_number} · `}{panel.ordered} {panel.unit} ordered · {orderOf(panel).location_name} · On hand: {panel.onHand}</div>
              </div>
              <button onClick={() => setPanelLine(null)} className="sq-btn" style={{ width: 28, height: 28 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
              {panel.stock.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)', fontSize: 13 }}>No stock available in this location</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: 12 }}>Available Stock</div>
                  {ordered(panel).map(s => {
                    const avail = availOf(panel, s)
                    if (avail <= 0 && !(panelQty[s.key] > 0)) return null
                    const q = panelQty[s.key] ?? 0
                    return (
                      <div key={s.key} style={{ background: 'var(--gray-50)', border: `1.5px solid ${q > 0 ? 'var(--teal-pale)' : 'var(--gray-200)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{s.bin ?? 'Default'}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-surface)', padding: '2px 8px', borderRadius: 6 }}>{avail} available</span>
                        </div>
                        {s.batch && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 3 }}>Batch: <strong>{s.batch}</strong></div>}
                        {s.expiry && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 3 }}>Expiry: <strong>{s.expiry}</strong></div>}
                        {s.serial && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 3 }}>Serial: <strong>{s.serial}</strong></div>}
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>Pick qty:</label>
                          <input
                            type="number" min={0} max={avail} value={q}
                            onChange={e => {
                              const others = panelTotal - q
                              const v = Math.min(Math.max(parseFloat(e.target.value) || 0, 0), avail, Math.max(capOf(panel) - others, 0))
                              setPanelQty(p => ({ ...p, [s.key]: v }))
                            }}
                            style={{ width: 80, padding: '6px 10px', border: '1.5px solid var(--gray-200)', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center', background: 'var(--white)', outline: 'none', fontFamily: 'var(--font-ui)' }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--gray-200)')}
                          />
                          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{panel.unit}</span>
                          {!allowOverPicking && panelTotal >= panel.ordered && q === 0 && (
                            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Ordered qty reached</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ padding: '10px 0', borderTop: '1px solid var(--gray-100)', marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--gray-400)' }}>
                    <span>Ordered: <strong>{panel.ordered}</strong></span>
                    <span>Selected: <strong style={{ color: panelTotal > panel.ordered ? '#92400E' : 'var(--slate)' }}>{panelTotal}</strong>{panelTotal > panel.ordered && <span style={{ color: '#92400E', fontSize: 11 }}> (over)</span>}</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--gray-100)', flexShrink: 0 }}>
              <button onClick={applyPanel} className="btn btn-primary" style={{ width: '100%', height: 38 }}>Add to Order</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push(backTo)} className="btn btn-outline" style={{ height: 38 }}>Cancel</button>
          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>{totalPicked} / {totalOrdered} units picked</div>
        </div>
        <button onClick={askConfirm} className="btn btn-primary" style={{ height: 38, padding: '0 24px' }} disabled={saving || lines.length === 0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Confirm Pick
        </button>
      </div>

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: '24px 26px', width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Confirm pick?</div>
            <div style={{ fontSize: 13.5, color: 'var(--gray-500, var(--gray-400))', lineHeight: 1.5, marginBottom: 20 }}>{confirmMsg}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setConfirm(false)} disabled={saving}>Go back</button>
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={submit} disabled={saving}>{saving ? 'Please wait…' : 'Confirm Pick'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
