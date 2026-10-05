'use client'
// src/components/app/xero-mapping.tsx
// Settings → Integrations → Xero → "Accounts and tax": the default Xero accounts and which Xero tax
// rate each Inventa tax rate posts as. Suggestions are filled in; nothing is saved until the admin clicks Save.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountLists, InventaTax, TaxMap, XeroSettings, XeroTaxRate } from '@/lib/xero/mapping'
type XeroAccount = AccountLists['sales'][number]

type Payload = {
  accounts: AccountLists
  taxRates: XeroTaxRate[]
  inventaRates: InventaTax[]
  settings: XeroSettings
  suggested: XeroSettings
  canEdit: boolean
}

type Draft = { sales: string; purchases: string; inventory: string; adjustment: string; tax: TaxMap }

const selectStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 8, background: 'var(--white)', fontSize: 13, color: 'var(--slate)' }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6, display: 'block' }

function draftFrom(p: Payload, useSuggested: boolean): Draft {
  const s = p.settings
  const sug = p.suggested
  const saved = Boolean(s.sales_account_code)
  const tax: TaxMap = {}
  for (const r of p.inventaRates) {
    const have = s.tax_map?.[r.id]
    const sg = sug.tax_map?.[r.id]
    tax[r.id] = {
      sales: (!useSuggested && have && have.sales !== undefined ? have.sales : sg?.sales) ?? null,
      purchases: (!useSuggested && have && have.purchases !== undefined ? have.purchases : sg?.purchases) ?? null,
    }
  }
  return {
    sales: (!useSuggested && saved ? s.sales_account_code : sug.sales_account_code) ?? '',
    purchases: (!useSuggested && saved ? s.purchases_account_code : sug.purchases_account_code) ?? '',
    inventory: (!useSuggested && saved ? s.inventory_account_code : sug.inventory_account_code) ?? '',
    adjustment: (!useSuggested && saved ? s.adjustment_account_code : sug.adjustment_account_code) ?? '',
    tax,
  }
}

export default function XeroMapping() {
  const [data, setData] = useState<Payload | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string>('')

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch('/api/integrations/xero/mapping', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(body.error ?? 'Could not load Xero accounts and tax rates.'); return }
      const p = body as Payload
      const d = draftFrom(p, false)
      setData(p)
      setDraft(d)
      setSaved(p.settings.sales_account_code ? JSON.stringify(d) : '')
    } catch {
      setLoadError('Network error — please try again.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => draft !== null && JSON.stringify(draft) !== saved, [draft, saved])
  const notSavedYet = data !== null && !data.settings.sales_account_code

  if (loadError) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>{loadError}</div>
        <button className="btn btn-outline" style={{ height: 34 }} onClick={() => void load()}>Try again</button>
      </Card>
    )
  }
  if (!data || !draft) return <Card><div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading from Xero…</div></Card>

  const canEdit = data.canEdit
  const missing = (list: XeroAccount[], code: string) => Boolean(code) && !list.some(a => a.code === code)

  async function save() {
    if (!draft) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/integrations/xero/mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { sales_account_code: draft.sales, purchases_account_code: draft.purchases, inventory_account_code: draft.inventory || null, adjustment_account_code: draft.adjustment || null, tax_map: draft.tax } }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'err', text: body.error ?? 'Could not save.' }); return }
      setSaved(JSON.stringify(draft))
      setData(d => (d ? { ...d, settings: body.settings } : d))
      setMsg({ kind: 'ok', text: 'Saved.' })
    } catch {
      setMsg({ kind: 'err', text: 'Network error — please try again.' })
    } finally {
      setBusy(false)
    }
  }

  function setTax(id: string, side: 'sales' | 'purchases', value: string) {
    setDraft(d => (d ? { ...d, tax: { ...d.tax, [id]: { ...d.tax[id], [side]: value || null } } } : d))
  }

  const unmapped = data.inventaRates.filter(r => !draft.tax[r.id]?.sales || !draft.tax[r.id]?.purchases).length

  return (
    <Card>
      {notSavedYet && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          We’ve filled in suggestions from your Xero chart of accounts. Check them, then click Save.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div>
          <label style={label}>Sales account</label>
          <select style={selectStyle} value={draft.sales} disabled={!canEdit} onChange={e => setDraft({ ...draft, sales: e.target.value })}>
            <option value="">Choose an account…</option>
            {missing(data.accounts.sales, draft.sales) && <option value={draft.sales}>{draft.sales} (no longer in Xero)</option>}
            {data.accounts.sales.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 5 }}>Invoice lines post here.</div>
        </div>
        <div>
          <label style={label}>Purchases account</label>
          <select style={selectStyle} value={draft.purchases} disabled={!canEdit} onChange={e => setDraft({ ...draft, purchases: e.target.value })}>
            <option value="">Choose an account…</option>
            {missing(data.accounts.purchases, draft.purchases) && <option value={draft.purchases}>{draft.purchases} (no longer in Xero)</option>}
            {data.accounts.purchases.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 5 }}>Bill lines post here.</div>
        </div>
        <div>
          <label style={label}>Inventory asset account</label>
          <select style={selectStyle} value={draft.inventory} disabled={!canEdit} onChange={e => setDraft({ ...draft, inventory: e.target.value })}>
            <option value="">Choose an account…</option>
            {missing(data.accounts.inventory, draft.inventory) && <option value={draft.inventory}>{draft.inventory} (no longer in Xero)</option>}
            {data.accounts.inventory.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 5 }}>Stock adjustment journals move value in and out of this account.</div>
        </div>
        <div>
          <label style={label}>Stock adjustment account</label>
          <select style={selectStyle} value={draft.adjustment} disabled={!canEdit} onChange={e => setDraft({ ...draft, adjustment: e.target.value })}>
            <option value="">Choose an account…</option>
            {missing(data.accounts.purchases, draft.adjustment) && <option value={draft.adjustment}>{draft.adjustment} (no longer in Xero)</option>}
            {data.accounts.purchases.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 5 }}>The other side of each journal, such as write-offs or cost of goods sold. Only used when inventory isn’t tracked in Xero.</div>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Tax rates</div>
      <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginBottom: 12 }}>Pick the Xero tax rate each Inventa tax rate posts as. Sales invoices use the first column, bills the second.</div>

      {data.inventaRates.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>You have no tax rates in Inventa yet. Add them under Settings → Tax rates.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                {['Inventa tax rate', 'Xero rate on sales invoices', 'Xero rate on bills'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--gray-400)', padding: '8px 10px 8px 0', borderBottom: '1px solid var(--gray-100)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.inventaRates.map(r => (
                <tr key={r.id}>
                  <td style={{ padding: '10px 10px 10px 0', fontSize: 13, color: 'var(--slate)', borderBottom: '1px solid var(--gray-100)', whiteSpace: 'nowrap' }}>
                    {r.name} <span style={{ color: 'var(--gray-400)' }}>({r.rate}%)</span>
                  </td>
                  {(['sales', 'purchases'] as const).map(side => (
                    <td key={side} style={{ padding: '10px 10px 10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                      <select style={selectStyle} value={draft.tax[r.id]?.[side] ?? ''} disabled={!canEdit} onChange={e => setTax(r.id, side, e.target.value)}>
                        <option value="">Not mapped</option>
                        {data.taxRates.filter(x => x[side]).map(x => <option key={x.taxType} value={x.taxType}>{x.name} ({x.rate}%)</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unmapped > 0 && (
        <div style={{ fontSize: 12.5, color: '#92400E', marginTop: 12 }}>
          {unmapped} tax {unmapped === 1 ? 'rate has' : 'rates have'} a column left as Not mapped. Documents using {unmapped === 1 ? 'it' : 'them'} can’t be posted to Xero until it’s mapped.
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: msg.kind === 'ok' ? '#047857' : '#B91C1C' }}>{msg.text}</div>
      )}

      {canEdit ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ height: 38 }} disabled={busy || !dirty || !draft.sales || !draft.purchases} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-outline" style={{ height: 38 }} disabled={busy} onClick={() => { setDraft(draftFrom(data, true)); setMsg(null) }}>Use suggestions</button>
          <button className="btn btn-outline" style={{ height: 38 }} disabled={busy} onClick={() => void load()}>Refresh from Xero</button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 16 }}>Only admins can change the Xero mapping.</div>
      )}
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.01em' }}>Accounts and tax</div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Where posted invoices and bills land in Xero</div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}
