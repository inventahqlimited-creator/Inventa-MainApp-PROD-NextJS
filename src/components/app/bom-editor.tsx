'use client'
// src/components/app/bom-editor.tsx
// The "Bill of Materials" tab of a kit / bundle product: the items (and services) it is made of, with quantities.
//  - cost is calculated from the components and is read-only
//  - the guide price on each line is only an indicative figure (defaults to the item's current selling price); orders use the kit's own price
import { useMemo, useState } from 'react'
import { guideTotal, kitCost, productCost } from '@/lib/kits/bom'

export type BomUiLine = { component_id: string; quantity: string; guide_price: string } // guide_price '' = follow the item's current selling price
export type BomProduct = {
  id: string; name: string; sku: string | null; type: string; unit: string | null; sell_uom?: string | null
  sell_price: number | null; cost_price: number | null; avg_cost?: number | null; last_cost?: number | null
  is_active: boolean | null; is_kit?: boolean | null
}

const money = (n: number) => `$${n.toFixed(2)}`
const typeLabel = (t: string) => (t === 'NonStock' ? 'Non Stock' : t)
const cell: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--gray-50)', verticalAlign: 'middle' }
const th: React.CSSProperties = { ...cell, fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid var(--gray-100)' }

export function BomEditor({ kitId, products, lines, onChange, editable, loading, sellPrice }: {
  kitId: string | null
  products: BomProduct[]
  lines: BomUiLine[]
  onChange: (l: BomUiLine[]) => void
  editable: boolean
  loading?: boolean
  sellPrice: number | null
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const used = useMemo(() => new Set(lines.map(l => l.component_id)), [lines])

  const matches = useMemo(() => {
    const s = search.trim().toLowerCase()
    return products
      .filter(p => p.id !== kitId && !p.is_kit && p.is_active !== false && !used.has(p.id))
      .filter(p => !s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s))
      .slice(0, 30)
  }, [products, kitId, used, search])

  const rows = lines.map(l => {
    const p = byId.get(l.component_id)
    const qty = Number(l.quantity)
    const cost = p ? productCost(p) : 0
    const sell = Number(p?.sell_price ?? 0)
    return { l, p, qty: Number.isFinite(qty) ? qty : 0, cost, sell }
  })
  const costTotal = kitCost(rows.map(r => ({ quantity: r.qty, cost: r.cost })))
  const guide = guideTotal(rows.map(r => ({ quantity: r.qty, guide_price: r.l.guide_price === '' ? null : Number(r.l.guide_price), sell_price: r.sell })))
  const price = Number(sellPrice ?? 0)
  const profit = price - costTotal

  const set = (i: number, patch: Partial<BomUiLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const add = (p: BomProduct) => { onChange([...lines, { component_id: p.id, quantity: '1', guide_price: '' }]); setSearch(''); setOpen(false) }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--gray-500, var(--gray-400))', lineHeight: 1.55, marginBottom: 12 }}>
        What this kit is made of. When the kit is sold, these items are taken from stock. The kit is sold at its own selling price — the prices below are a guide only.
      </div>

      {editable && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input className="modal-input" value={search} placeholder="Search an item or service to add…"
            onChange={e => { setSearch(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (
            <div className="inv-dropdown" style={{ display: 'block', width: '100%', maxHeight: 260, overflowY: 'auto' }}>
              {matches.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-400)' }}>No matching items. Kits can’t be placed inside other kits.</div>}
              {matches.map(p => (
                <div key={p.id} className="fp-item" onMouseDown={e => { e.preventDefault(); add(p) }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--gray-400)', marginLeft: 8, fontSize: 12 }}>{p.sku ?? ''} · {typeLabel(p.type)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>
      ) : lines.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--gray-400)' }}>
          {editable ? 'No items yet. Search above to add the first one.' : 'This kit has no items yet.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Item</th><th style={{ ...th, width: 90 }}>Qty</th><th style={{ ...th, width: 80 }}>Unit</th>
                <th style={{ ...th, width: 110 }}>Guide price</th><th style={{ ...th, width: 90, textAlign: 'right' }}>Cost</th>{editable && <th style={{ ...th, width: 36 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.l.component_id}>
                  <td style={cell}>
                    <div style={{ fontWeight: 600 }}>{r.p?.name ?? 'Unknown item'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{r.p?.sku ?? ''}{r.p ? ` · ${typeLabel(r.p.type)}` : ''}{r.p && r.p.is_active === false ? ' · inactive' : ''}</div>
                  </td>
                  <td style={cell}>
                    {editable
                      ? <input className="modal-input" type="number" min="0" step="any" value={r.l.quantity} onChange={e => set(i, { quantity: e.target.value })} style={{ height: 32 }} />
                      : r.l.quantity}
                  </td>
                  <td style={{ ...cell, color: 'var(--gray-400)' }}>{r.p?.sell_uom ?? r.p?.unit ?? 'Each'}</td>
                  <td style={cell}>
                    {editable
                      ? <input className="modal-input" type="number" min="0" step="0.01" value={r.l.guide_price} placeholder={r.sell.toFixed(2)} onChange={e => set(i, { guide_price: e.target.value })} style={{ height: 32 }} title="Leave empty to follow the item’s current selling price" />
                      : money(r.l.guide_price === '' ? r.sell : Number(r.l.guide_price))}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.cost * r.qty)}</td>
                  {editable && (
                    <td style={cell}>
                      <button type="button" className="sq-btn" aria-label={`Remove ${r.p?.name ?? 'item'}`} title="Remove" onClick={() => onChange(lines.filter((_, idx) => idx !== i))}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 14, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <div><div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Guide total</div><strong>{money(guide)}</strong></div>
        <div><div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kit cost (calculated)</div><strong>{money(costTotal)}</strong></div>
        <div><div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit at kit price</div><strong style={{ color: profit < 0 ? '#B91C1C' : undefined }}>{money(profit)}</strong></div>
      </div>
    </div>
  )
}
