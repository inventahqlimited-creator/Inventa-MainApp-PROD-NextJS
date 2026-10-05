'use client'
// src/components/app/xero-preferences.tsx
// Settings → Integrations → Xero → "Posting and automatic sync": draft or approved, which date to use,
// and how often to sync on its own (manual by default). Nothing is saved until the admin clicks Save.
import { useCallback, useEffect, useState } from 'react'
import { SCHEDULE_LABELS, SCOPE_LABELS, type Schedule, type Scope, type XeroPrefs } from '@/lib/xero/prefs'

type Payload = { prefs: XeroPrefs; lastSyncAt: string | null; lastFullSyncAt: string | null; nextSyncAt: string | null; timezone: string; canEdit: boolean }

const selectStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 8, background: 'var(--white)', fontSize: 13, color: 'var(--slate)' }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6, display: 'block' }
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--gray-400)', marginTop: 5 }

const STATUS_OPTIONS = [{ v: 'DRAFT', t: 'Draft' }, { v: 'AUTHORISED', t: 'Approved' }]

function fmt(iso: string | null, tz: string) {
  if (!iso) return '—'
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  try { return new Date(iso).toLocaleString('en-NZ', { ...opts, timeZone: tz }) } catch { return new Date(iso).toLocaleString('en-NZ', opts) }
}

export default function XeroPreferences() {
  const [data, setData] = useState<Payload | null>(null)
  const [draft, setDraft] = useState<XeroPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/integrations/xero/preferences', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not load these settings.'); return }
      setData(body as Payload)
      setDraft((body as Payload).prefs)
    } catch {
      setError('Network error — please try again.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save() {
    if (!draft) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/integrations/xero/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'err', text: body.error ?? 'Could not save.' }); return }
      setData(body as Payload)
      setDraft((body as Payload).prefs)
      setMsg({ kind: 'ok', text: 'Saved.' })
    } catch {
      setMsg({ kind: 'err', text: 'Network error — please try again.' })
    } finally {
      setBusy(false)
    }
  }

  const dirty = data && draft ? JSON.stringify(data.prefs) !== JSON.stringify(draft) : false
  const can = Boolean(data?.canEdit)
  const set = <K extends keyof XeroPrefs>(k: K, v: XeroPrefs[K]) => { setDraft(d => (d ? { ...d, [k]: v } : d)); setMsg(null) }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.01em' }}>Posting and automatic sync</div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>How invoices and bills are posted, and whether Inventa syncs with Xero on its own</div>
      </div>
      <div style={{ padding: 20 }}>
        {error && <div style={{ fontSize: 13, color: '#B91C1C' }}>{error} <button className="btn btn-outline" style={{ height: 30, marginLeft: 8 }} onClick={() => void load()}>Try again</button></div>}
        {!error && !draft && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}
        {draft && data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
              <div>
                <label style={label}>Post invoices as</label>
                <select style={selectStyle} disabled={!can} value={draft.invoice_status} onChange={e => set('invoice_status', e.target.value as XeroPrefs['invoice_status'])}>
                  {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                </select>
                <div style={hint}>Approved invoices are ready to send and be paid in Xero.</div>
              </div>
              <div>
                <label style={label}>Post bills as</label>
                <select style={selectStyle} disabled={!can} value={draft.bill_status} onChange={e => set('bill_status', e.target.value as XeroPrefs['bill_status'])}>
                  {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Date used in Xero</label>
                <select style={selectStyle} disabled={!can} value={draft.date_basis} onChange={e => set('date_basis', e.target.value as XeroPrefs['date_basis'])}>
                  <option value="created">Created date (order date)</option>
                  <option value="delivery">Delivery date</option>
                </select>
                <div style={hint}>Invoices use the delivery date (shipped), bills use the date received. If there isn’t one, the order date is used.</div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--gray-100)', margin: '22px 0' }} />

            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>Stock adjustments</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
              <div>
                <label style={label}>Do you track inventory in Xero?</label>
                <select style={selectStyle} disabled={!can} value={draft.inventory_tracked ? 'yes' : 'no'} onChange={e => set('inventory_tracked', e.target.value === 'yes')}>
                  <option value="no">No (default)</option>
                  <option value="yes">Yes</option>
                </select>
                <div style={hint}>
                  {draft.inventory_tracked
                    ? 'Xero holds your stock quantities, so InventaHQ does not send stock adjustments. Post each adjustment in Xero yourself.'
                    : 'InventaHQ holds your stock. Each completed stock adjustment is sent to Xero as a journal.'}
                </div>
              </div>
              {!draft.inventory_tracked && (
                <div>
                  <label style={label}>Post stock adjustment journals as</label>
                  <select style={selectStyle} disabled={!can} value={draft.journal_status} onChange={e => set('journal_status', e.target.value as XeroPrefs['journal_status'])}>
                    <option value="DRAFT">Draft (review in Xero first)</option>
                    <option value="POSTED">Posted</option>
                  </select>
                  <div style={hint}>Choose the inventory and stock adjustment accounts under Accounts and tax.</div>
                </div>
              )}
            </div>
            {draft.inventory_tracked && (
              <div style={{ ...hint, marginTop: 12, lineHeight: 1.5 }}>
                Mark your items as tracked in Xero (they are matched by item code). Xero won’t accept an invoice for a tracked item it doesn’t have stock of, so bills are posted before invoices.
              </div>
            )}
            {data.prefs.inventory_tracked !== draft.inventory_tracked && (
              <div style={{ fontSize: 12.5, marginTop: 12, padding: '9px 12px', borderRadius: 8, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                This only affects stock adjustments completed after you save. Earlier ones are left as they are.
              </div>
            )}

            <div style={{ height: 1, background: 'var(--gray-100)', margin: '22px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
              <div>
                <label style={label}>Automatic sync</label>
                <select style={selectStyle} disabled={!can} value={draft.schedule} onChange={e => set('schedule', e.target.value as Schedule)}>
                  {(Object.keys(SCHEDULE_LABELS) as Schedule[]).map(s => <option key={s} value={s}>{s === 'manual' ? 'Manual (default)' : SCHEDULE_LABELS[s]}</option>)}
                </select>
                <div style={hint}>Manual means nothing posts until someone clicks Sync now.</div>
              </div>
              {draft.schedule !== 'manual' && (
                <div>
                  <label style={label}>What to sync</label>
                  <select style={selectStyle} disabled={!can} value={draft.scope} onChange={e => set('scope', e.target.value as Scope)}>
                    {(Object.keys(SCOPE_LABELS) as Scope[]).map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
                  </select>
                </div>
              )}
            </div>

            {draft.schedule !== 'manual' && (
              <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 14 }}>
                {dirty || !data.nextSyncAt
                  ? 'Save to start the schedule. The first automatic sync runs one interval after saving.'
                  : <>Next automatic sync: <strong style={{ color: 'var(--slate)' }}>{fmt(data.nextSyncAt, data.timezone)}</strong></>}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
              Times are shown in your organisation’s time zone ({data.timezone.replace(/_/g, ' ')}). Last full sync: {fmt(data.lastFullSyncAt, data.timezone)}
            </div>

            {msg && <div style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: msg.kind === 'ok' ? '#047857' : '#B91C1C' }}>{msg.text}</div>}

            {can ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <button className="btn btn-primary" style={{ height: 38 }} disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn btn-outline" style={{ height: 38 }} disabled={busy || !dirty} onClick={() => { setDraft(data.prefs); setMsg(null) }}>Cancel</button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 16 }}>Only admins can change these settings.</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
