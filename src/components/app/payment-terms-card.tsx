'use client'
// src/components/app/payment-terms-card.tsx
// Settings → Contacts: manage the organisation's payment terms (name + rule).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TERM_TYPES, describeTerm, type TermType } from '@/lib/payment-terms'

type Row = { id: string; name: string; type: TermType; days: number; source: string; contacts: number }
type Draft = { id: string | null; name: string; type: TermType; days: string }
const EMPTY: Draft = { id: null, name: '', type: 'days', days: '30' }

export default function PaymentTermsCard({ canManage, showToast }: { canManage: boolean; showToast: (t: 'success' | 'error', m: string) => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const r = await fetch('/api/org/payment-terms')
    const j = await r.json().catch(() => null)
    if (!r.ok) { showToast('error', j?.error ?? 'Could not load payment terms'); setRows([]); return }
    setRows(j)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!draft) return
    setBusy(true)
    const body = { name: draft.name, type: draft.type, days: Number(draft.days) }
    const r = await fetch(draft.id ? `/api/org/payment-terms/${draft.id}` : '/api/org/payment-terms', {
      method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { showToast('error', j.error ?? 'Could not save'); return }
    showToast('success', draft.id ? 'Payment term updated' : 'Payment term added')
    setDraft(null); await load(); router.refresh()
  }

  async function remove(t: Row) {
    if (!window.confirm(`Delete the payment term "${t.name}"?`)) return
    const r = await fetch(`/api/org/payment-terms/${t.id}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { showToast('error', j.error ?? 'Could not delete'); return }
    showToast('success', 'Payment term deleted'); await load(); router.refresh()
  }

  const type = TERM_TYPES.find(t => t.value === draft?.type)
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>Payment Terms</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Used on contacts, sales orders and purchase orders to work out due dates. Can be imported from Xero.</div>
        </div>
        {canManage && !draft && <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={() => setDraft(EMPTY)}>+ Add term</button>}
      </div>

      {draft && (
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 0.6fr auto', gap: 12, alignItems: 'end', borderBottom: '1px solid var(--gray-100)' }}>
          <label style={{ fontSize: 12, color: 'var(--gray-500)' }}>Name
            <input className="modal-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. 20th of next month" />
          </label>
          <label style={{ fontSize: 12, color: 'var(--gray-500)' }}>Rule
            <select className="modal-input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as TermType })}>
              {TERM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--gray-500)' }}>Days / day
            <input className="modal-input" type="number" min={0} max={999} value={draft.days} onChange={e => setDraft({ ...draft, days: e.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ height: 36 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn" style={{ height: 36 }} onClick={() => setDraft(null)}>Cancel</button>
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--gray-400)' }}>{type?.hint}</div>
        </div>
      )}

      <div>
        {rows === null && <div style={{ padding: 20, fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}
        {rows?.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
            <div style={{ flex: 1, fontWeight: 600, color: 'var(--slate)' }}>{t.name}{t.source === 'xero' && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>from Xero</span>}</div>
            <div style={{ flex: 1.4, color: 'var(--gray-500)' }}>{describeTerm(t)}</div>
            <div style={{ width: 90, color: 'var(--gray-400)', textAlign: 'right' }}>{t.contacts} contact{t.contacts === 1 ? '' : 's'}</div>
            {canManage && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => setDraft({ id: t.id, name: t.name, type: t.type, days: String(t.days) })}>Edit</button>
                <button className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => remove(t)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
