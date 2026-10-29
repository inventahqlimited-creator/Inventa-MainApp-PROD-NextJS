'use client'
// src/components/app/bom-editor.tsx
// The "Bill of Materials" tab of a kit / bundle product: the items (and services) it is made of, with quantities.
// Cost is calculated from the components and is read-only; orders use the kit's own selling price.
import { useMemo, useState } from 'react'
import { kitCost, productCost } from '@/lib/kits/bom'

export type BomUiLine = { component_id: string; quantity: string; guide_price: string } // guide_price '' = follow the item's current selling price
export type BomProduct = {
  id: string; name: string; sku: string | null; type: string; unit: string | null; sell_uom?: string | null
  sell_price: number | null; cost_price: number | null; avg_cost?: number | null; last_cost?: number | null
  is_active: boolean | null; is_kit?: boolean | null
}

const money = (n: number) => `$${n.toFixed(2)}`
const typeLabel = (t: string) => (t === 'NonStock' ? 'Non Stock' : t)
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
    return { l, p, qty: Number.isFinite(qty) ? qty : 0, cost: p ? productCost(p) : 0 }
  })
  const costTotal = kitCost(rows.map(r => ({ quantity: r.qty, cost: r.cost })))
  const price = Number(sellPrice ?? 0)
  const profit = price - costTotal

  const set = (i: number, patch: Partial<BomUiLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const add = (p: BomProduct) => { onChange([...lines, { component_id: p.id, quantity: '1', guide_price: '' }]); setSearch(''); setOpen(false) }

  return (
    <div>
      {editable && (
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input className="modal-input" value={search} placeholder="Search an item or service to add…"
            onChange={e => { setSearch(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (
            <div className="inv-dropdown" style={{ display: 'block', left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 260, overflowY: 'auto' }}>
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
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-400)', fontSize: 13, background: 'var(--gray-50)', borderRadius: 12 }}>
          {editable ? 'No items yet. Search above to add the first one.' : 'This kit has no items yet.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--gray-100)', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th className="li-th" style={{ textAlign: 'left' }}>Item</th>
                <th className="li-th" style={{ textAlign: 'right', width: 100 }}>Qty</th>
                <th className="li-th" style={{ textAlign: 'left', width: 80 }}>Unit</th>
                <th className="li-th" style={{ textAlign: 'right', width: 100 }}>Cost</th>
                {editable && <th className="li-th" style={{ width: 40 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.l.component_id}>
                  <td className="li-td">
                    <div style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{r.p?.name ?? 'Unknown item'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{r.p?.sku ?? ''}{r.p ? ` · ${typeLabel(r.p.type)}` : ''}{r.p && r.p.is_active === false ? ' · inactive' : ''}</div>
                  </td>
                  <td className="li-td" style={{ textAlign: 'right' }}>
                    {editable
                      ? <input className="li-input right" type="number" min="0" step="any" value={r.l.quantity} onChange={e => set(i, { quantity: e.target.value })} style={{ textAlign: 'right', maxWidth: 90 }} />
                      : r.l.quantity}
                  </td>
                  <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 13 }}>{r.p?.sell_uom ?? r.p?.unit ?? 'Each'}</td>
                  <td className="li-td" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{money(r.cost * r.qty)}</td>
                  {editable && (
                    <td className="li-td" style={{ textAlign: 'center' }}>
                      <button type="button" title="Remove" aria-label={`Remove ${r.p?.name ?? 'item'}`} onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                        style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 14 }}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ background: 'var(--teal-surface)', border: '1px solid var(--teal-pale)', borderRadius: 9, padding: '10px 14px', marginTop: 14, fontSize: 12.5, color: 'var(--teal)', display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' }}>
        <span>Kit cost (calculated from items): <strong>{money(costTotal)}</strong></span>
        <span>Profit at kit price: <strong style={{ color: profit < 0 ? 'var(--danger)' : undefined }}>{money(profit)}</strong></span>
      </div>
    </div>
  )
}
