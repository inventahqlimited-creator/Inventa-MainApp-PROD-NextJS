'use client'
// src/components/app/credit-note-form.tsx
// One credit note (Sales Return): new (edit mode), then view mode like the other transaction screens —
// header Actions menu, bottom bar with Close Credit Note; Edit Credit Note switches an Open one to edit mode.
//   • Whole-return reason (open text) and a return-to location; each line has its own bin.
//   • Nothing moves until Close: a confirmation popup, then the stock comes back and the credit note goes to Xero.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ScreenData, ScreenRow } from '@/lib/credit-notes/screen'
import { creditLineTotal } from '@/lib/credit-notes/config'
import { printCreditNotes } from '@/lib/credit-notes/print'
import { toast } from '@/components/app/toast'
import { cnBadge } from '@/components/app/returns-table'
import RelatedOrders from '@/components/app/related-orders'
import type { RelatedDoc } from '@/lib/related-docs'

type Row = { key: number; so_line_id: string; quantity: string; bin_id: string; serial_number: string; batch_number: string; expiry_date: string }
const inputStyle: React.CSSProperties = { border: '1.5px solid var(--gray-200)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--gray-900)', background: '#fff', width: '100%' }
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

// Actions dropdown in the header of a saved credit note (view mode), same pattern as the other transaction screens
function CreditNoteActions({ soId, canEdit, canCancel, canPrint, canRetryXero, onEdit, onPrint, onCancel, onRetryXero }: {
  soId: string; canEdit: boolean; canCancel: boolean; canPrint: boolean; canRetryXero: boolean
  onEdit: () => void; onPrint: () => void; onCancel: () => void; onRetryXero: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d} /></svg>
  const item = (label: string, onClick: () => void, icon: React.ReactNode, danger = false) => (
    <div key={label} className="fp-item" onClick={() => { setOpen(false); onClick() }} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', color: danger ? 'var(--danger)' : undefined }}>
      <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  )
  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-outline" style={{ height: 34, marginLeft: 4 }} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        Actions
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="inv-dropdown" role="menu" style={{ display: 'block', position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 230, padding: 6, zIndex: 60 }}>
          {canEdit && item('Edit Credit Note', onEdit, ic('M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'))}
          {canPrint && item('Print Credit Note', onPrint, ic('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z'))}
          {item('View Sales Order', () => router.push(`/sales/${soId}`), ic('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8'))}
          {canRetryXero && item('Post to Xero again', onRetryXero, ic('M3 12a9 9 0 1 0 3-6.7M3 4v5h5'))}
          {canCancel && <><div style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />{item('Cancel Credit Note', onCancel, ic('M18 6 6 18M6 6l12 12'), true)}</>}
        </div>
      )}
    </div>
  )
}

export default function CreditNoteForm({ data, canProcess, isAdmin, startInEdit = false, related }: { data: ScreenData; canProcess: boolean; isAdmin: boolean; startInEdit?: boolean; related?: RelatedDoc[] }) {
  const router = useRouter()
  const { cn, so, lines, locations, bins, xero } = data
  const isNew = cn.status === 'New'
  const canEdit = canProcess && cn.status === 'Open'
  const [mode, setMode] = useState<'view' | 'edit'>(isNew || (startInEdit && canEdit) ? 'edit' : 'view')
  const editable = canProcess && mode === 'edit' && (isNew || cn.status === 'Open')

  const [locationId, setLocationId] = useState(cn.location_id)
  const [returnDate, setReturnDate] = useState(cn.return_date)
  const [reason, setReason] = useState(cn.reason)
  const [notes, setNotes] = useState(cn.notes)
  const keyRef = useState({ n: 1 })[0]
  const mk = (r: Partial<ScreenRow> & { so_line_id: string }): Row => ({
    key: keyRef.n++, so_line_id: r.so_line_id, quantity: r.quantity ? String(r.quantity) : '', bin_id: r.bin_id ?? '',
    serial_number: r.serial_number ?? '', batch_number: r.batch_number ?? '', expiry_date: r.expiry_date ?? '',
  })
  const [rows, setRows] = useState<Row[]>(() => {
    if (data.rows.length) return data.rows.map(mk)
    // a new credit note starts with one empty row per order line that can still be returned
    return lines.filter(l => l.shipped - l.returned > 0).map(l => mk({ so_line_id: l.id }))
  })
  const [busy, setBusy] = useState<null | 'save' | 'close' | 'cancel' | 'retry'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | 'close' | 'cancel'>(null)

  const lineById = useMemo(() => new Map(lines.map(l => [l.id, l])), [lines])
  const locBins = useMemo(() => bins.filter(b => b.location_id === locationId), [bins, locationId])
  const used = rows.filter(r => Number(r.quantity) > 0)
  const total = used.reduce((s, r) => { const l = lineById.get(r.so_line_id); return l ? s + creditLineTotal({ quantity: r.quantity, unit_price: l.unit_price, discount: l.discount, tax_rate: l.tax_rate }) : s }, 0)
  const money = (n: number) => `${cn.currency ? cn.currency + ' ' : ''}${n.toLocaleString('en-NZ', { minimumFractionDigits: data.decimals, maximumFractionDigits: data.decimals })}`

  const setRow = (key: number, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const payload = () => ({
    so_id: so.id, location_id: locationId, return_date: returnDate, reason, notes,
    lines: used.map(r => ({ so_line_id: r.so_line_id, quantity: Number(r.quantity), bin_id: r.bin_id || null, serial_number: r.serial_number || null, batch_number: r.batch_number || null, expiry_date: r.expiry_date || null })),
  })

  const validate = (): string | null => {
    if (!locationId) return 'Choose the location the stock is returned to.'
    if (!reason.trim()) return 'Enter the reason for the return.'
    if (used.length === 0) return 'Enter a quantity for at least one item being returned.'
    return null
  }

  async function save(): Promise<string | null> {
    const v = validate(); if (v) { setError(v); return null }
    setError(null); setBusy('save')
    try {
      const res = await fetch(cn.id ? `/api/org/credit-notes/${cn.id}` : '/api/org/credit-notes', { method: cn.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not save the credit note.'); return null }
      return (d.id as string | undefined) ?? cn.id
    } catch { setError('Network error — please try again.'); return null } finally { setBusy(null) }
  }

  async function onSave() {
    const id = await save()
    if (!id) return
    if (!cn.id) { toast.later('success', 'Credit note created'); router.push(`/sales/returns/${id}`) }
    else { toast.success('Credit note saved'); setMode('view'); router.refresh() }
  }

  async function onClose() {
    setConfirm(null)
    const id = await save()      // always close what is on screen, not an older save
    if (!id) return
    setBusy('close'); setError(null)
    try {
      const res = await fetch(`/api/org/credit-notes/${id}/close`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not close the credit note.'); router.refresh(); return }
      const loc = locations.find(l => l.id === locationId)?.name ?? 'the location'
      const x = d.xero as { state: string; error?: string; status?: string } | undefined
      if (x?.state === 'failed') toast.error(`Credit note closed and stock returned to ${loc}, but Xero didn’t accept it: ${x.error}`)
      else if (x?.state === 'posted') toast.success(`Credit note closed. Stock returned to ${loc} and sent to Xero as ${x.status === 'AUTHORISED' ? 'approved' : 'draft'}.`)
      else toast.success(`Credit note closed. Stock returned to ${loc}.`)
      router.push(`/sales/returns/${id}`); router.refresh()
    } catch { setError('Network error — please try again.') } finally { setBusy(null) }
  }

  async function onCancel() {
    setConfirm(null); setBusy('cancel'); setError(null)
    try {
      const res = await fetch(`/api/org/credit-notes/${cn.id}/cancel`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not cancel.'); return }
      toast.success('Credit note cancelled'); setMode('view'); router.refresh()
    } finally { setBusy(null) }
  }

  async function onRetryXero() {
    setBusy('retry'); setError(null)
    try {
      const res = await fetch('/api/integrations/xero/credit-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cn.id }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Xero did not accept it.'); return }
      toast.success(`Sent to Xero as ${d.status === 'AUTHORISED' ? 'approved' : 'draft'}`); router.refresh()
    } finally { setBusy(null) }
  }

  async function onPrint() {
    if (!cn.id) return
    const r = await printCreditNotes([cn.id])
    if (!r.ok) setError(r.error)
  }

  const title = cn.cn_number ?? 'New Credit Note'
  const locName = locations.find(l => l.id === locationId)?.name ?? '—'
  const backHref = cn.id ? '/sales/returns' : `/sales/${so.id}`
  const discard = () => {
    setLocationId(cn.location_id); setReturnDate(cn.return_date); setReason(cn.reason); setNotes(cn.notes)
    setRows(data.rows.map(mk)); setError(null); setMode('view')
  }
  const fmtDate = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }
  const readText = (v: string) => <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--slate)', padding: '4px 0', whiteSpace: 'pre-wrap' }}>{v || '—'}</div>
  const shownRows = editable ? rows : rows.filter(r => Number(r.quantity) > 0)
  const footerBtn = { height: 38 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push(backHref)} className="sq-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--slate)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
              Against <a onClick={() => router.push(`/sales/${so.id}`)} style={{ color: 'var(--teal)', cursor: 'pointer' }}>{so.so_number}</a>{so.invoice_number ? ` · invoice ${so.invoice_number}` : ''} · {so.customer_name}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isNew && mode === 'edit' && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Editing</span>}
          {isNew
            ? <><span style={{ fontSize: 12, color: 'var(--gray-400)' }}>New</span><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} /></>
            : cnBadge(cn.status)}
          {!isNew && mode === 'view' && (
            <CreditNoteActions
              soId={so.id}
              canEdit={canEdit}
              canCancel={canEdit}
              canPrint={cn.status !== 'Cancelled'}
              canRetryXero={cn.status === 'Closed' && xero.show && xero.status !== 'synced' && isAdmin}
              onEdit={() => { setError(null); setMode('edit') }}
              onPrint={() => void onPrint()}
              onCancel={() => setConfirm('cancel')}
              onRetryXero={() => void onRetryXero()}
            />
          )}
        </div>
      </div>

      <div className="doc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 100px' }}>
        {error && <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>}
        {(cn.status === 'Closed' || cn.status === 'Cancelled') && (
          <div style={{ background: '#F8FAFC', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>
            This credit note is <strong style={{ color: 'var(--slate)' }}>{cn.status}</strong> and cannot be edited.
          </div>
        )}
        {cn.status === 'Closed' && xero.show && (
          <div style={{ marginBottom: 20, padding: '10px 16px', borderRadius: 10, background: xero.status === 'synced' ? '#D1FAE5' : '#FEF3C7', color: xero.status === 'synced' ? '#065F46' : '#92400E', fontSize: 13 }}>
            {xero.status === 'synced' ? 'Posted to Xero.' : `Xero: not posted${xero.error ? ` — ${xero.error}` : '.'}`}
            {xero.status === 'synced' && xero.error ? ` Note: ${xero.error}` : ''}
            {xero.status !== 'synced' && isAdmin && ' Use Actions → Post to Xero again.'}
          </div>
        )}

        {/* Details */}
        <div className="npo-card" style={{ marginBottom: 20 }}>
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Return Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <span style={label}>Return to location</span>
              {editable ? (
                <select style={inputStyle} value={locationId} onChange={e => { setLocationId(e.target.value); setRows(rs => rs.map(r => ({ ...r, bin_id: '' }))) }}>
                  <option value="">Select…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              ) : readText(locName)}
            </div>
            <div>
              <span style={label}>Return date</span>
              {editable ? <input type="date" style={inputStyle} value={returnDate} onChange={e => setReturnDate(e.target.value)} /> : readText(fmtDate(returnDate))}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Reason for return</span>
              {editable
                ? <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Faulty on arrival, wrong size ordered…" />
                : readText(reason)}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Notes (optional, printed on the credit note)</span>
              {editable ? <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} /> : readText(notes)}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="npo-card">
          <div className="npo-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Items Returned
          </div>
          <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="li-th">Item</th><th className="li-th" style={{ textAlign: 'right' }}>Shipped</th><th className="li-th" style={{ textAlign: 'right' }}>Returned before</th>
                  <th className="li-th" style={{ width: 90 }}>Qty back</th><th className="li-th">Serial</th><th className="li-th">Batch</th><th className="li-th">Bin</th>
                  <th className="li-th" style={{ textAlign: 'right' }}>Price</th><th className="li-th" style={{ textAlign: 'right' }}>Credit (incl. tax)</th>{editable && <th className="li-th" style={{ width: 30 }} />}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, i) => {
                  const l = lineById.get(r.so_line_id); if (!l) return null
                  const first = i === 0 || shownRows[i - 1].so_line_id !== r.so_line_id
                  const sameLine = rows.filter(x => x.so_line_id === r.so_line_id)
                  const taken = new Set(sameLine.filter(x => x.key !== r.key).map(x => x.serial_number).filter(Boolean))
                  const binName = locBins.find(b => b.id === r.bin_id)?.name
                  return (
                    <tr key={r.key}>
                      <td className="li-td" style={{ whiteSpace: 'normal', minWidth: 200 }}>{first ? <><div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{l.product_name}</div><div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{l.product_sku}</div></> : <span style={{ color: 'var(--gray-300)' }}>↳ same item</span>}</td>
                      <td className="li-td" style={{ textAlign: 'right' }}>{first ? l.shipped : ''}</td>
                      <td className="li-td" style={{ textAlign: 'right' }}>{first ? l.returned : ''}</td>
                      <td className="li-td">{editable ? <input style={inputStyle} inputMode="decimal" value={r.quantity} onChange={e => setRow(r.key, { quantity: e.target.value.replace(/[^0-9.]/g, '') })} /> : <span style={{ fontWeight: 600 }}>{r.quantity || '0'}</span>}</td>
                      <td className="li-td">{l.serial ? (editable ? (
                        <select style={inputStyle} value={r.serial_number} onChange={e => setRow(r.key, { serial_number: e.target.value, quantity: e.target.value ? '1' : r.quantity })}>
                          <option value="">Select…</option>{l.serials.filter(s => !taken.has(s) || s === r.serial_number).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>) : (r.serial_number || '—')) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                      <td className="li-td">{l.batch ? (editable ? (
                        <select style={inputStyle} value={r.batch_number} onChange={e => setRow(r.key, { batch_number: e.target.value })}>
                          <option value="">Select…</option>{l.batches.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>) : (r.batch_number || '—')) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                      <td className="li-td">{l.stock && locBins.length > 0 ? (editable ? (
                        <select style={inputStyle} value={r.bin_id} onChange={e => setRow(r.key, { bin_id: e.target.value })}>
                          <option value="">No bin</option>{locBins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>) : (binName ?? 'No bin')) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                      <td className="li-td" style={{ textAlign: 'right' }}>{money(l.unit_price)}{l.discount > 0 ? <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>−{Number(l.discount.toFixed(2))}%</div> : null}</td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 600 }}>{Number(r.quantity) > 0 ? money(creditLineTotal({ quantity: r.quantity, unit_price: l.unit_price, discount: l.discount, tax_rate: l.tax_rate })) : '—'}</td>
                      {editable && <td className="li-td">{(l.serial || l.batch || l.stock) && (
                        <button type="button" title="Add another row for this item" onClick={() => setRows(rs => { const at = rs.map(x => x.so_line_id).lastIndexOf(r.so_line_id); const n = mk({ so_line_id: r.so_line_id }); return [...rs.slice(0, at + 1), n, ...rs.slice(at + 1)] })}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--teal)', fontSize: 18, lineHeight: 1 }}>＋</button>)}
                        {sameLine.length > 1 && <button type="button" title="Remove row" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 15 }}>✕</button>}</td>}
                    </tr>
                  )
                })}
                {shownRows.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 28 }}>{editable ? 'Everything on this order has already been returned.' : 'No items on this credit note.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 16, fontSize: 14, paddingTop: 14 }}>
            <span style={{ color: 'var(--gray-400)' }}>Credit total (incl. tax)</span>
            <strong style={{ color: 'var(--slate)' }}>{money(cn.status === 'Closed' || cn.status === 'Cancelled' ? cn.total_amount : total)}</strong>
          </div>
        </div>
        {cn.status !== 'Closed' && cn.status !== 'Cancelled' && (
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)', margin: '12px 2px' }}>
            Returned items go back into stock when you Close this credit note. Damaged goods are written off afterwards with a stock adjustment.
          </div>
        )}
        {!isNew && related && <RelatedOrders items={related} />}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--gray-100)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {mode === 'edit' ? (
          <button onClick={() => (isNew ? router.push(backHref) : discard())} className="btn btn-outline" style={footerBtn} disabled={!!busy}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </button>
        ) : (
          <button onClick={() => router.push('/sales/returns')} className="btn btn-outline" style={footerBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Returns
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mode === 'edit' && editable && (
            <button className="btn btn-primary" style={{ ...footerBtn, padding: '0 20px', fontSize: 14 }} disabled={!!busy} onClick={onSave}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {busy === 'save' ? (isNew ? 'Creating…' : 'Saving…') : isNew ? 'Create Credit Note' : 'Save Changes'}
            </button>
          )}
          {mode === 'view' && canEdit && (
            <button className="btn btn-primary" style={{ ...footerBtn, padding: '0 20px', fontSize: 14 }} disabled={!!busy} onClick={() => { const v = validate(); if (v) setError(v); else { setError(null); setConfirm('close') } }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {busy === 'close' ? 'Closing…' : 'Close Credit Note'}
            </button>
          )}
        </div>
      </div>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div><div className="modal-title">{confirm === 'close' ? `Close ${title}?` : `Cancel ${title}?`}</div></div></div>
            <div className="modal-body" style={{ fontSize: 13.5, color: 'var(--gray-600, #4B5563)', lineHeight: 1.55 }}>
              {confirm === 'close'
                ? <>Closing adds the returned items back into stock at <strong>{locations.find(l => l.id === locationId)?.name ?? 'the chosen location'}</strong>{xero.show ? ' and sends the credit note to Xero' : ''}. A closed credit note can’t be changed or reopened.</>
                : <>This credit note will be cancelled. No stock has moved, so nothing needs undoing.</>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Go back</button>
              <button className={confirm === 'close' ? 'btn btn-primary' : 'btn btn-danger'} onClick={confirm === 'close' ? onClose : onCancel}>{confirm === 'close' ? 'Close Credit Note' : 'Cancel Credit Note'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
