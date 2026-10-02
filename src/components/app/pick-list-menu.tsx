'use client'

// src/components/app/pick-list-menu.tsx
// The Print button with its dropdown, used on the Pick screen and in the Sales list's bulk-action bar.
//   1 order          → "Print Pick List"
//   2 or more orders → "Print Pick List" (one page per order) and "Print Consolidated Pick List"
// On the Pick screen the consolidated list follows the grouping on screen (By Order / By Product).
// Where there is no grouping to follow (the Sales list), both groupings are offered.
// On the Sales list the same menu also prints the Packing List (packIds) and the Invoice (invoiceIds): one page per order.

import { useEffect, useRef, useState } from 'react'
import { printPickList } from '@/lib/pick-list/print'
import { printPackingList } from '@/lib/packing-list/print'
import { printInvoice } from '@/lib/invoice/print'
import type { PickListMode } from '@/lib/pick-list/types'

const PRINTER = 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z'

export default function PickListMenu({
  ids, packIds = [], invoiceIds = [], grouping, size = 'md', onError,
}: {
  /** Orders a pick list can be printed for */
  ids: string[]
  /** Orders a packing list can be printed for (leave out where packing lists aren't offered) */
  packIds?: string[]
  /** Orders an invoice can be printed for (leave out where invoices aren't offered) */
  invoiceIds?: string[]
  grouping?: 'order' | 'product'
  size?: 'md' | 'sm'
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const many = ids.length > 1

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function run(mode: PickListMode) {
    setOpen(false)
    setBusy(true)
    const res = await printPickList(ids, mode)
    setBusy(false)
    if (!res.ok) onError?.(res.error)
  }

  async function runPacking() {
    setOpen(false)
    setBusy(true)
    const res = await printPackingList(packIds)
    setBusy(false)
    if (!res.ok) onError?.(res.error)
  }

  async function runInvoice() {
    setOpen(false)
    setBusy(true)
    const res = await printInvoice(invoiceIds)
    setBusy(false)
    if (!res.ok) onError?.(res.error)
  }

  const item = (label: string, sub: string, mode: PickListMode) => (
    <div key={mode + label} className="fp-item" onClick={() => run(mode)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, cursor: 'pointer', padding: '8px 12px' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{label}</span>
      <span style={{ fontSize: 11.5, color: 'var(--gray-400)', fontWeight: 400 }}>{sub}</span>
    </div>
  )

  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className={size === 'sm' ? 'btn-sm btn-sm-ghost' : 'btn btn-outline'}
        style={size === 'sm' ? { display: 'inline-flex', alignItems: 'center', gap: 6 } : { height: 36 }}
        onClick={() => setOpen(o => !o)}
        disabled={busy || (ids.length === 0 && packIds.length === 0 && invoiceIds.length === 0)}
        title="Print"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={PRINTER} /></svg>
        {busy ? 'Preparing…' : 'Print'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="inv-dropdown" role="menu" style={{ display: 'block', position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 270, padding: 6, zIndex: 60 }}>
          {ids.length > 0 && item('Print Pick List', many ? `One page per order · ${ids.length} orders` : 'This order', 'single')}
          {many && grouping === 'order' && item('Print Consolidated Pick List', 'One list, grouped by order', 'consolidated-order')}
          {many && grouping === 'product' && item('Print Consolidated Pick List', 'One list, grouped by product', 'consolidated-product')}
          {many && !grouping && item('Print Consolidated Pick List', 'One list, grouped by order', 'consolidated-order')}
          {many && !grouping && item('Print Consolidated Pick List', 'One list, grouped by product', 'consolidated-product')}
          {packIds.length > 0 && ids.length > 0 && <div style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />}
          {packIds.length > 0 && (
            <div className="fp-item" onClick={runPacking} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, cursor: 'pointer', padding: '8px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>Print Packing List</span>
              <span style={{ fontSize: 11.5, color: 'var(--gray-400)', fontWeight: 400 }}>{packIds.length > 1 ? `One page per order · ${packIds.length} orders` : 'This order'}</span>
            </div>
          )}
          {invoiceIds.length > 0 && (ids.length > 0 || packIds.length > 0) && <div style={{ height: 1, background: 'var(--gray-100)', margin: '5px 0' }} />}
          {invoiceIds.length > 0 && (
            <div className="fp-item" onClick={runInvoice} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, cursor: 'pointer', padding: '8px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{invoiceIds.length > 1 ? 'Print Invoices' : 'Print Invoice'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--gray-400)', fontWeight: 400 }}>{invoiceIds.length > 1 ? `One page per order · ${invoiceIds.length} orders` : 'This order'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
