'use client'
// src/components/app/credit-note-form.tsx
// One credit note (Sales Return): new, Open (editable), Closed or Cancelled (read only).
//   • Whole-return reason (open text) and a return-to location; each line has its own bin.
//   • Nothing moves until Close: a confirmation popup, then the stock comes back and the credit note goes to Xero.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ScreenData, ScreenRow } from '@/lib/credit-notes/screen'
import { creditLineTotal } from '@/lib/credit-notes/config'
import { printCreditNotes } from '@/lib/credit-notes/print'
import { toast } from '@/components/app/toast'
import { cnBadge } from '@/components/app/returns-table'

type Row = { key: number; so_line_id: string; quantity: string; bin_id: string; serial_number: string; batch_number: string; expiry_date: string }
const inputStyle: React.CSSProperties = { border: '1.5px solid var(--gray-200)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--gray-900)', background: '#fff', width: '100%' }
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

export default function CreditNoteForm({ data, canProcess, isAdmin }: { data: ScreenData; canProcess: boolean; isAdmin: boolean }) {
  const router = useRouter()
  const { cn, so, lines, locations, bins, xero } = data
  const editable = canProcess && (cn.status === 'New' || cn.status === 'Open')

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
    else { toast.success('Credit note saved'); router.refresh() }
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
      toast.success('Credit note cancelled'); router.refresh()
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

  const title = cn.cn_number ?? 'New credit note'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="page-header-card" style={{ borderRadius: 16, paddingBottom: 4 }}>
        <div className="page-header-top">
          <div>
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{title} {cn.status !== 'New' && cnBadge(cn.status)}</div>
            <div className="page-subtitle">Against {so.so_number}{so.invoice_number ? ` · invoice ${so.invoice_number}` : ''} · {so.customer_name}</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-outline" onClick={() => router.push(cn.id ? '/sales/returns' : `/sales/${so.id}`)}>Back</button>
            {cn.id && cn.status !== 'Cancelled' && <button className="btn btn-outline" onClick={onPrint}>Print</button>}
            {editable && cn.id && <button className="btn btn-outline" disabled={!!busy} onClick={() => setConfirm('cancel')}>Cancel credit note</button>}
            {editable && <button className={cn.id ? 'btn btn-outline' : 'btn btn-primary'} disabled={!!busy} onClick={onSave}>{busy === 'save' ? 'Saving…' : cn.id ? 'Save' : 'Create credit note'}</button>}
            {editable && cn.id && <button className="btn btn-primary" disabled={!!busy} onClick={() => { const v = validate(); if (v) setError(v); else { setError(null); setConfirm('close') } }}>{busy === 'close' ? 'Closing…' : 'Close'}</button>}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 24px' }}>
        {error && <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13 }}>{error}</div>}

        {cn.status === 'Closed' && xero.show && (
          <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 10, background: xero.status === 'synced' ? '#D1FAE5' : '#FEF3C7', color: xero.status === 'synced' ? '#065F46' : '#92400E', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {xero.status === 'synced' ? 'Posted to Xero.' : `Xero: not posted${xero.error ? ` — ${xero.error}` : '.'}`}
              {xero.status === 'synced' && xero.error ? ` Note: ${xero.error}` : ''}
            </span>
            {xero.status !== 'synced' && isAdmin && <button className="btn-sm btn-sm-primary" disabled={!!busy} onClick={onRetryXero}>{busy === 'retry' ? 'Sending…' : 'Retry'}</button>}
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid var(--gray-100)', borderRadius: 14, padding: 18, margin: '12px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <span style={label}>Return to location</span>
            <select style={inputStyle} disabled={!editable} value={locationId} onChange={e => { setLocationId(e.target.value); setRows(rs => rs.map(r => ({ ...r, bin_id: '' }))) }}>
              <option value="">Select…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Return date</span>
            <input type="date" style={inputStyle} disabled={!editable} value={returnDate} onChange={e => setReturnDate(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={label}>Reason for return</span>
            <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} disabled={!editable} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Faulty on arrival, wrong size ordered…" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={label}>Notes (optional, printed on the credit note)</span>
            <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} disabled={!editable} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="table-container" style={{ margin: '4px 0 0', borderRadius: 14, border: '1px solid var(--gray-100)', flex: 'none' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th><th style={{ textAlign: 'right' }}>Shipped</th><th style={{ textAlign: 'right' }}>Returned before</th>
                  <th style={{ width: 90 }}>Qty back</th><th>Serial</th><th>Batch</th><th>Bin</th>
                  <th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Credit (incl. tax)</th><th style={{ width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const l = lineById.get(r.so_line_id); if (!l) return null
                  const first = i === 0 || rows[i - 1].so_line_id !== r.so_line_id
                  const sameLine = rows.filter(x => x.so_line_id === r.so_line_id)
                  const taken = new Set(sameLine.filter(x => x.key !== r.key).map(x => x.serial_number).filter(Boolean))
                  return (
                    <tr key={r.key}>
                      <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{first ? <><div style={{ fontWeight: 600 }}>{l.product_name}</div><div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{l.product_sku}</div></> : <span style={{ color: 'var(--gray-300)' }}>↳ same item</span>}</td>
                      <td style={{ textAlign: 'right' }}>{first ? l.shipped : ''}</td>
                      <td style={{ textAlign: 'right' }}>{first ? l.returned : ''}</td>
                      <td><input style={inputStyle} inputMode="decimal" disabled={!editable} value={r.quantity} onChange={e => setRow(r.key, { quantity: e.target.value.replace(/[^0-9.]/g, '') })} /></td>
                      <td>{l.serial ? (
                        <select style={inputStyle} disabled={!editable} value={r.serial_number} onChange={e => setRow(r.key, { serial_number: e.target.value, quantity: e.target.value ? '1' : r.quantity })}>
                          <option value="">Select…</option>{l.serials.filter(s => !taken.has(s) || s === r.serial_number).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                      <td>{l.batch ? (
                        <select style={inputStyle} disabled={!editable} value={r.batch_number} onChange={e => setRow(r.key, { batch_number: e.target.value })}>
                          <option value="">Select…</option>{l.batches.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                      <td>{l.stock && locBins.length > 0 ? (
                        <select style={inputStyle} disabled={!editable} value={r.bin_id} onChange={e => setRow(r.key, { bin_id: e.target.value })}>
                          <option value="">No bin</option>{locBins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                      <td style={{ textAlign: 'right' }}>{money(l.unit_price)}{l.discount > 0 ? <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>−{Number(l.discount.toFixed(2))}%</div> : null}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(r.quantity) > 0 ? money(creditLineTotal({ quantity: r.quantity, unit_price: l.unit_price, discount: l.discount, tax_rate: l.tax_rate })) : '—'}</td>
                      <td>{editable && (l.serial || l.batch || l.stock) && (
                        <button type="button" title="Add another row for this item" onClick={() => setRows(rs => { const at = rs.map(x => x.so_line_id).lastIndexOf(r.so_line_id); const n = mk({ so_line_id: r.so_line_id }); return [...rs.slice(0, at + 1), n, ...rs.slice(at + 1)] })}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--teal)', fontSize: 18, lineHeight: 1 }}>＋</button>)}
                        {editable && sameLine.length > 1 && <button type="button" title="Remove row" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 15 }}>✕</button>}</td>
                    </tr>
                  )
                })}
                {rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 28 }}>Everything on this order has already been returned.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-footer" style={{ justifyContent: 'flex-end', gap: 16, fontSize: 14 }}>
            <span style={{ color: 'var(--gray-400)' }}>Credit total (incl. tax)</span>
            <strong>{money(cn.status === 'Closed' || cn.status === 'Cancelled' ? cn.total_amount : total)}</strong>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', margin: '10px 2px' }}>
          Returned items go back into stock when you Close this credit note. Damaged goods are written off afterwards with a stock adjustment.
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
              <button className={confirm === 'close' ? 'btn btn-primary' : 'btn btn-danger'} onClick={confirm === 'close' ? onClose : onCancel}>{confirm === 'close' ? 'Close credit note' : 'Cancel credit note'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
