'use client'

// src/components/app/pack-sales-order.tsx
// Pack screen — one or several orders. Put picked items into cartons, add shipping details, then mark the orders Packed.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { printPackingList } from '@/lib/packing-list/print'
import type { PackOverrides } from '@/lib/packing-list/types'
import { toast } from '@/components/app/toast'

type Line = { id: string; name: string; sku: string; unit: string; picked: number }
type Carton = { key: number; name: string; qty: Record<string, number> }
type Order = { id: string; so_number: string; customer_name: string }
type OrderPack = {
  order: Order
  lines: Line[]
  savedCartons: { name: string; lines: { line_id: string; qty: number }[] }[]
  carrier: string
  method: string
  service: string
  tracking: string
}
type State = { cartons: Carton[]; counter: number; carrier: string; method: string; service: string; tracking: string }

const CARRIERS = ['NZ Post', 'Aramex', 'DHL', 'FedEx', 'Aus Post', 'UPS', 'TNT', 'Other']
const METHODS = ['Standard Courier', 'Express Courier', 'Overnight', 'Courier by Sea', 'Road Freight', 'Air Freight', 'Customer Pickup', 'Other']

export default function PackSalesOrder({ packs }: { packs: OrderPack[] }) {
  const router = useRouter()
  const single = packs.length === 1
  const backTo = single ? `/sales/${packs[0].order.id}` : '/sales'

  const [states, setStates] = useState<Record<string, State>>(() =>
    Object.fromEntries(packs.map(p => [p.order.id, {
      cartons: p.savedCartons.length
        ? p.savedCartons.map((c, i) => ({ key: i + 1, name: c.name, qty: Object.fromEntries(c.lines.map(l => [l.line_id, l.qty])) }))
        : [{ key: 1, name: 'Carton 1', qty: {} }],
      counter: Math.max(1, p.savedCartons.length),
      carrier: p.carrier, method: p.method, service: p.service, tracking: p.tracking,
    } as State])),
  )
  const [open, setOpen] = useState<{ oid: string; id: 'carrier' | 'method' } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setErrorRaw] = useState<string | null>(null)
  const setError = (m: string | null) => { setErrorRaw(m); if (m) toast.error(m) }

  const upd = (oid: string, fn: (s: State) => State) => setStates(all => ({ ...all, [oid]: fn(all[oid]) }))
  const packedOf = (oid: string, lineId: string) => states[oid].cartons.reduce((s, c) => s + (c.qty[lineId] ?? 0), 0)

  const totalPicked = packs.reduce((t, p) => t + p.lines.reduce((s, l) => s + l.picked, 0), 0)
  const totalPacked = packs.reduce((t, p) => t + p.lines.reduce((s, l) => s + Math.min(packedOf(p.order.id, l.id), l.picked), 0), 0)
  const unpacked = totalPicked - totalPacked

  function setQty(oid: string, ci: number, l: Line, raw: string) {
    let q = parseFloat(raw)
    if (!Number.isFinite(q) || q < 0) q = 0
    const others = packedOf(oid, l.id) - (states[oid].cartons[ci].qty[l.id] ?? 0)
    q = Math.min(q, Math.max(l.picked - others, 0))
    upd(oid, s => ({ ...s, cartons: s.cartons.map((c, i) => (i === ci ? { ...c, qty: { ...c.qty, [l.id]: q } } : c)) }))
  }
  function addCarton(oid: string) {
    upd(oid, s => {
      const n = s.counter + 1
      return { ...s, counter: n, cartons: [...s.cartons, { key: n, name: `Carton ${n}`, qty: {} }] }
    })
  }
  function removeCarton(oid: string, ci: number) {
    if (states[oid].cartons.length === 1) { setError('At least one carton is required.'); return }
    setError(null)
    upd(oid, s => ({ ...s, cartons: s.cartons.filter((_, i) => i !== ci) }))
  }

  // Print what is on screen right now — cartons, carrier and tracking — even though none of it is saved yet
  async function printPacking() {
    setPrinting(true)
    setError(null)
    const overrides: PackOverrides = Object.fromEntries(packs.map(p => {
      const s = states[p.order.id]
      return [p.order.id, {
        carrier: s.carrier, method: s.method, service: s.service, tracking: s.tracking,
        cartons: s.cartons.map(c => ({ lines: Object.entries(c.qty).filter(([, q]) => q > 0).map(([line_id, qty]) => ({ line_id, qty })) })),
      }]
    }))
    const res = await printPackingList(packs.map(p => p.order.id), overrides)
    setPrinting(false)
    if (!res.ok) setError(res.error)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    let done = 0
    try {
      for (const p of packs) {
        const s = states[p.order.id]
        const res = await fetch(`/api/org/sales/${p.order.id}/pack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cartons: s.cartons.map((c, i) => ({
              name: c.name.trim() || `Carton ${i + 1}`,
              lines: Object.entries(c.qty).filter(([, q]) => q > 0).map(([line_id, qty]) => ({ line_id, qty })),
            })),
            carrier: s.carrier, method: s.method, service: s.service, tracking: s.tracking,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setConfirm(false)
          setError(`${p.order.so_number}: ${data.error ?? 'Could not pack this order'}${done ? ` (${done} order${done !== 1 ? 's were' : ' was'} already packed)` : ''}`)
          return
        }
        done++
      }
      toast.later('success', done > 1 ? `${done} orders packed` : 'Order packed')
      router.push(backTo)
      router.refresh()
    } catch {
      setConfirm(false)
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const chevron = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
  const dd = (oid: string, label: string, id: 'carrier' | 'method', value: string, options: string[], minWidth: number) => (
    <div className="modal-field">
      <label className="modal-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <button type="button" className="modal-dd-btn" onClick={e => { e.stopPropagation(); setOpen(open?.oid === oid && open.id === id ? null : { oid, id }) }} style={{ background: 'var(--white)' }}>
          <span>{value}</span>{chevron}
        </button>
        {open?.oid === oid && open.id === id && (
          <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth }} onClick={e => e.stopPropagation()}>
            <div className="col-dropdown-title">{label}</div>
            {options.map(o => (
              <div key={o} className={`fp-item${o === value ? ' active' : ''}`} onClick={() => { upd(oid, s => ({ ...s, [id]: o })); setOpen(null) }}>{o}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const lineCount = packs.reduce((t, p) => t + p.lines.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => setOpen(null)}>
      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push(backTo)} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>{single ? 'Pack Order' : 'Pack Orders'}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>{packs.length} order{packs.length !== 1 ? 's' : ''} · {lineCount} line{lineCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 100px' }}>
        {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}

        {packs.map(p => {
          const oid = p.order.id
          const s = states[oid]
          return (
            <div key={oid} style={{ marginBottom: packs.length > 1 ? 36 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>{p.order.so_number}</div>
                <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>{p.order.customer_name}</div>
              </div>

              {/* Cartons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                {s.cartons.map((c, ci) => {
                  const items = p.lines.reduce((t, l) => t + (c.qty[l.id] ?? 0), 0)
                  return (
                    <div key={c.key} style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                          <input
                            value={c.name}
                            onChange={e => upd(oid, st => ({ ...st, cartons: st.cartons.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)) }))}
                            spellCheck={false}
                            style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700, color: 'var(--slate)', outline: 'none', border: 'none', borderBottom: '1px dashed transparent', background: 'transparent', width: 160 }}
                            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--teal)')}
                            onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                          />
                          <span style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{items} item{items !== 1 ? 's' : ''}</span>
                        </div>
                        <button onClick={() => removeCarton(oid, ci)} className="row-action-btn row-action-btn-danger" title="Remove carton">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        {p.lines.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '6px 0' }}>No picked items on this order.</div>}
                        {p.lines.map(l => (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--gray-50)' }}>
                            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{l.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{l.picked} picked</div>
                            <input
                              type="number" min={0} max={l.picked} value={c.qty[l.id] ?? 0}
                              onChange={e => setQty(oid, ci, l, e.target.value)}
                              style={{ width: 60, padding: '4px 8px', border: '1.5px solid var(--gray-200)', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'center', background: 'var(--white)', outline: 'none', fontFamily: 'var(--font-ui)' }}
                              onFocus={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                              onBlur={e => (e.currentTarget.style.borderColor = 'var(--gray-200)')}
                            />
                            <span style={{ fontSize: 12, color: 'var(--gray-400)', width: 36 }}>{l.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button onClick={() => addCarton(oid)} className="btn btn-outline" style={{ height: 34, fontSize: 12.5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Carton
              </button>

              {/* Shipping details */}
              <div className="npo-card" style={{ marginTop: 16 }}>
                <div className="npo-card-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  Shipping Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {dd(oid, 'Carrier', 'carrier', s.carrier, CARRIERS, 190)}
                  {dd(oid, 'Shipping Method', 'method', s.method, METHODS, 230)}
                  <div className="modal-field">
                    <label className="modal-label">Service Type</label>
                    <input className="modal-input" placeholder="e.g. DHL Overnight" value={s.service} onChange={e => upd(oid, st => ({ ...st, service: e.target.value }))} style={{ background: 'var(--white)' }} />
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Tracking Number</label>
                    <input className="modal-input" placeholder="Enter tracking #" value={s.tracking} onChange={e => upd(oid, st => ({ ...st, tracking: e.target.value }))} style={{ background: 'var(--white)' }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push(backTo)} className="btn btn-outline" style={{ height: 38 }}>Cancel</button>
          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>{totalPacked} / {totalPicked} units in cartons</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={printPacking} className="btn btn-outline" style={{ height: 38 }} disabled={saving || printing} title="Print the packing list as it looks on screen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
            {printing ? 'Preparing…' : 'Print Packing List'}
          </button>
          {single && (
            <button onClick={() => router.push(`/sales/${packs[0].order.id}/pick`)} className="btn btn-outline" style={{ height: 38 }} disabled={saving} title="Change what has been picked (unsaved carton changes are lost)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Pick
            </button>
          )}
          <button onClick={() => { setError(null); setConfirm(true) }} className="btn btn-primary" style={{ height: 38, padding: '0 24px' }} disabled={saving}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Confirm Pack
          </button>
        </div>
      </div>

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: '24px 26px', width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>
              {single ? `Confirm packing for ${packs[0].order.so_number}?` : `Confirm packing for ${packs.length} orders?`}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
              {unpacked > 0 && <>{unpacked} picked unit{unpacked !== 1 ? 's are' : ' is'} not in any carton. </>}
              {single ? 'The order' : 'The orders'} will be marked Packed. Nothing leaves stock yet — you can still change the picking or packing until you close {single ? 'the order' : 'them'}.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" style={{ height: 38 }} onClick={() => setConfirm(false)} disabled={saving}>Go back</button>
              <button className="btn btn-primary" style={{ height: 38, padding: '0 20px' }} onClick={submit} disabled={saving}>{saving ? 'Please wait…' : 'Yes, mark as Packed'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
