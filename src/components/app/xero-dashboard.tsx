'use client'
// src/components/app/xero-dashboard.tsx
// The connected Xero page: a "Sync now" bar, then a section each for contacts and products
// with counts, what failed, what exists in only one system, and a button to sync that section.
import { useCallback, useEffect, useState } from 'react'
import type { Overview } from '@/lib/xero/sync'
import type { InvoiceOverview } from '@/lib/xero/invoice'

type Entity = 'contact' | 'product'
type SyncSummary = { linked: number; created: number; failed: number; unchanged: number; failures: { id: string; name: string; error: string }[] }
type Notice = { kind: 'ok' | 'err'; text: string } | null

const LABEL: Record<Entity, { one: string; many: string; code: string }> = {
  contact: { one: 'contact', many: 'contacts', code: '' },
  product: { one: 'product', many: 'products', code: 'SKU' },
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never'

function summaryText(entity: Entity, s: SyncSummary): string {
  const parts: string[] = []
  if (s.created) parts.push(`${s.created} created in Xero`)
  if (s.linked) parts.push(`${s.linked} matched to existing Xero ${s.linked === 1 ? LABEL[entity].one : LABEL[entity].many}`)
  if (s.failed) parts.push(`${s.failed} failed`)
  if (parts.length === 0) return `All ${LABEL[entity].many} are already synced.`
  return `${LABEL[entity].many[0].toUpperCase()}${LABEL[entity].many.slice(1)}: ${parts.join(', ')}.`
}

async function runSync(entity: Entity): Promise<{ ok: true; summary: SyncSummary } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/integrations/xero/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body.error ?? 'Sync failed.' }
    return { ok: true, summary: body as SyncSummary }
  } catch {
    return { ok: false, error: 'Network error — please try again.' }
  }
}

const noticeStyle = (n: NonNullable<Notice>): React.CSSProperties => ({
  padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
  background: n.kind === 'ok' ? '#ECFDF5' : '#FEF2F2', color: n.kind === 'ok' ? '#047857' : '#B91C1C', border: `1px solid ${n.kind === 'ok' ? '#A7F3D0' : '#FECACA'}`,
})

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' | 'good' }) {
  return (
    <div style={{ flex: '1 1 110px', minWidth: 0, padding: '12px 14px', border: '1px solid var(--gray-100)', borderRadius: 10, background: 'var(--gray-50)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-400)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: tone === 'bad' && Number(value) > 0 ? '#B91C1C' : tone === 'good' ? '#047857' : 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function ListBlock({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--gray-400)', margin: '2px 0 8px' }}>{hint}</div>}
      {children}
    </div>
  )
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, color: 'var(--slate)' }

function Section({ entity, isAdmin, reloadKey, onChanged }: { entity: Entity; isAdmin: boolean; reloadKey: number; onChanged: () => void }) {
  const l = LABEL[entity]
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'sync' | 'import' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showAllInv, setShowAllInv] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/integrations/xero/overview?entity=${entity}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not load from Xero.'); return }
      setData(body as Overview)
      setPicked(new Set())
    } catch {
      setError('Network error — please try again.')
    }
  }, [entity])

  useEffect(() => { void load() }, [load, reloadKey])

  async function sync() {
    setBusy('sync'); setNotice(null)
    const r = await runSync(entity)
    setBusy(null)
    if (!r.ok) { setNotice({ kind: 'err', text: r.error }); return }
    setNotice({ kind: r.summary.failed ? 'err' : 'ok', text: summaryText(entity, r.summary) })
    await load()
    onChanged()
  }

  async function importPicked() {
    if (picked.size === 0) return
    setBusy('import'); setNotice(null)
    try {
      const res = await fetch('/api/integrations/xero/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity, xeroIds: [...picked] }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice({ kind: 'err', text: body.error ?? 'Import failed.' }); return }
      const bits = [`${body.imported} imported`]
      if (body.linked) bits.push(`${body.linked} linked to existing`)
      if (body.failed?.length) bits.push(`${body.failed.length} failed`)
      setNotice({ kind: body.failed?.length ? 'err' : 'ok', text: `${bits.join(', ')}.` })
      await load()
      onChanged()
    } catch {
      setNotice({ kind: 'err', text: 'Network error — please try again.' })
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div style={{ paddingTop: 22, marginTop: 22, borderTop: '1px solid var(--gray-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)', textTransform: 'capitalize' }}>{l.many}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Last synced: {data ? when(data.lastSyncedAt) : '…'}</div>
        </div>
        {isAdmin && <button className="btn btn-primary" style={{ height: 34 }} disabled={busy !== null} onClick={() => void sync()}>{busy === 'sync' ? 'Syncing…' : `Sync ${l.many}`}</button>}
      </div>

      {notice && <div style={{ ...noticeStyle(notice), marginBottom: 14 }}>{notice.text}</div>}

      {error && (
        <div>
          <div style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10 }}>{error}</div>
          <button className="btn btn-outline" style={{ height: 32 }} onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!error && !data && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading from Xero…</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Tile label="In Inventa" value={data.inventa} />
            <Tile label="In Xero" value={data.xero} />
            <Tile label="Synced" value={data.synced} tone="good" />
            <Tile label="Not synced" value={data.notSynced} />
            <Tile label="Failed" value={data.failed} tone="bad" />
          </div>

          {data.failures.length > 0 && (
            <ListBlock title={`Failed (${data.failures.length})`} hint="Fix the reason, then sync again.">
              {data.failures.map(f => (
                <div key={f.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: '#B91C1C' }}>{f.error}</span>
                </div>
              ))}
            </ListBlock>
          )}

          {data.onlyInInventa.length > 0 && (
            <ListBlock title={`Only in Inventa (${data.onlyInInventa.length})`} hint={`These ${l.many} will be created in Xero when you sync.`}>
              {(showAllInv ? data.onlyInInventa : data.onlyInInventa.slice(0, 8)).map(i => <div key={i.id} style={rowStyle}>{i.name}</div>)}
              {data.onlyInInventa.length > 8 && (
                <button className="btn btn-outline" style={{ height: 28, fontSize: 12, marginTop: 8 }} onClick={() => setShowAllInv(s => !s)}>
                  {showAllInv ? 'Show fewer' : `Show all ${data.onlyInInventa.length}`}
                </button>
              )}
            </ListBlock>
          )}

          {data.onlyInXero.length > 0 && (
            <ListBlock title={`Only in Xero (${data.onlyInXero.length})`} hint={isAdmin ? `Tick the ${l.many} you want to bring into Inventa. Nothing is imported automatically.` : `Not in Inventa. An admin can import them.`}>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--gray-100)', borderRadius: 10, padding: '0 12px' }}>
                {data.onlyInXero.map(x => (
                  <label key={x.xeroId} style={{ ...rowStyle, cursor: isAdmin ? 'pointer' : 'default' }}>
                    {isAdmin && <input type="checkbox" checked={picked.has(x.xeroId)} onChange={() => toggle(x.xeroId)} style={{ accentColor: 'var(--teal)' }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>{x.name}</span>
                    {x.code && <span style={{ fontSize: 11.5, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{x.code}</span>}
                  </label>
                ))}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ height: 32 }} disabled={busy !== null || picked.size === 0} onClick={() => void importPicked()}>
                    {busy === 'import' ? 'Importing…' : `Import selected (${picked.size})`}
                  </button>
                  <button className="btn btn-outline" style={{ height: 32 }} disabled={busy !== null}
                    onClick={() => setPicked(picked.size === Math.min(data.onlyInXero.length, 100) ? new Set() : new Set(data.onlyInXero.slice(0, 100).map(x => x.xeroId)))}>
                    {picked.size > 0 ? 'Clear' : 'Select all'}
                  </button>
                </div>
              )}
              {data.onlyInXero.length > 100 && <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 6 }}>Select all picks the first 100. Import them, then repeat for the rest.</div>}
            </ListBlock>
          )}

          {data.failures.length === 0 && data.onlyInInventa.length === 0 && data.onlyInXero.length === 0 && (
            <div style={{ fontSize: 13, color: '#047857', marginTop: 14 }}>Everything matches between Inventa and Xero.</div>
          )}
        </>
      )}
    </div>
  )
}

type BulkSummary = { posted: number; failed: number; remaining: number; failures: { id: string; name: string; error: string }[]; stopped?: string }

/** Posts Closed orders in batches of 20 until none are left (or Xero asks us to slow down). */
async function runInvoices(): Promise<{ ok: true; posted: number; failed: number; failures: BulkSummary['failures'] } | { ok: false; error: string }> {
  let posted = 0, failed = 0
  const failures: BulkSummary['failures'] = []
  for (let round = 0; round < 15; round++) {
    let body: BulkSummary & { error?: string }
    try {
      const res = await fetch('/api/integrations/xero/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
      body = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: body.error ?? 'Posting invoices failed.' }
    } catch {
      return { ok: false, error: 'Network error — please try again.' }
    }
    posted += body.posted; failed += body.failed; failures.push(...body.failures)
    if (body.stopped) return { ok: false, error: `${body.stopped} ${posted} posted so far.` }
    if (body.remaining <= 0 || body.posted + body.failed === 0) break
  }
  return { ok: true, posted, failed, failures }
}

const invoiceText = (r: { posted: number; failed: number }) =>
  r.posted === 0 && r.failed === 0 ? 'Invoices: nothing new to post.' : `Invoices: ${r.posted} posted as drafts${r.failed ? `, ${r.failed} failed` : ''}.`

function InvoiceSection({ isAdmin, reloadKey }: { isAdmin: boolean; reloadKey: number }) {
  const [data, setData] = useState<InvoiceOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/integrations/xero/overview?entity=invoice', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not load invoices.'); return }
      setData(body as InvoiceOverview)
    } catch {
      setError('Network error — please try again.')
    }
  }, [])
  useEffect(() => { void load() }, [load, reloadKey])

  async function sync() {
    setBusy(true); setNotice(null)
    const r = await runInvoices()
    setBusy(false)
    setNotice(r.ok ? { kind: r.failed ? 'err' : 'ok', text: invoiceText(r) } : { kind: 'err', text: r.error })
    await load()
  }

  return (
    <div style={{ paddingTop: 22, marginTop: 22, borderTop: '1px solid var(--gray-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)' }}>Invoices</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Closed sales orders post to Xero as draft invoices. Last posted: {data ? when(data.lastPostedAt) : '…'}</div>
        </div>
        {isAdmin && <button className="btn btn-primary" style={{ height: 34 }} disabled={busy} onClick={() => void sync()}>{busy ? 'Posting…' : 'Sync invoices'}</button>}
      </div>

      {notice && <div style={{ ...noticeStyle(notice), marginBottom: 14 }}>{notice.text}</div>}
      {error && <div style={{ fontSize: 13, color: '#B91C1C' }}>{error}</div>}
      {!error && !data && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Tile label="Closed orders" value={data.eligible} />
            <Tile label="Posted" value={data.posted} tone="good" />
            <Tile label="Not posted" value={data.notPosted} />
            <Tile label="Failed" value={data.failed} tone="bad" />
          </div>

          {data.failures.length > 0 && (
            <ListBlock title={`Failed (${data.failures.length})`} hint="Fix the reason, then post again from the order or with Sync invoices.">
              {data.failures.map(f => (
                <div key={f.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <a href={`/sales/${f.id}`} style={{ fontWeight: 600, color: 'var(--slate)' }}>{f.name}</a>
                  <span style={{ fontSize: 12, color: '#B91C1C' }}>{f.error}</span>
                </div>
              ))}
            </ListBlock>
          )}

          {data.recent.length > 0 && (
            <ListBlock title="Recently posted">
              {data.recent.map(r => (
                <div key={r.id} style={rowStyle}>
                  <span style={{ fontWeight: 600, minWidth: 90 }}>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--slate)' }}>{r.number}</a> : r.number}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--gray-500)' }}>{r.customer}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>${r.total.toFixed(2)}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--gray-400)', minWidth: 90, textAlign: 'right' }}>{when(r.postedAt)}</span>
                </div>
              ))}
            </ListBlock>
          )}

          {data.eligible === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 14 }}>No closed sales orders yet. Close an order, then post it here or from its Actions menu.</div>}
        </>
      )}
    </div>
  )
}

export default function XeroDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  async function syncAll() {
    setBusy(true); setNotice(null)
    const lines: string[] = []
    let bad = false
    let stop = false
    for (const entity of ['contact', 'product'] as Entity[]) {
      const r = await runSync(entity)
      if (!r.ok) { lines.push(`${LABEL[entity].many}: ${r.error}`); bad = true; if (/busy|rate/i.test(r.error)) { stop = true; break } continue }
      lines.push(summaryText(entity, r.summary))
      if (r.summary.failed) bad = true
    }
    if (!stop) {
      const r = await runInvoices()
      if (r.ok) { lines.push(invoiceText(r)); if (r.failed) bad = true } else { lines.push(`Invoices: ${r.error}`); bad = true }
    }
    setBusy(false)
    setNotice({ kind: bad ? 'err' : 'ok', text: lines.join(' ') })
    setReloadKey(k => k + 1)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 16px', background: 'var(--gray-50)', border: '1px solid var(--gray-100)', borderRadius: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, color: 'var(--slate)' }}>Sync everything</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Sends new contacts, then products, then closed sales orders (as draft invoices) to Xero.</div>
        </div>
        {isAdmin
          ? <button className="btn btn-primary" style={{ height: 38 }} disabled={busy} onClick={() => void syncAll()}>{busy ? 'Syncing…' : 'Sync now'}</button>
          : <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Only admins can sync.</span>}
      </div>
      {notice && <div style={{ ...noticeStyle(notice), marginTop: 12 }}>{notice.text}</div>}

      <Section entity="contact" isAdmin={isAdmin} reloadKey={reloadKey} onChanged={() => undefined} />
      <Section entity="product" isAdmin={isAdmin} reloadKey={reloadKey} onChanged={() => undefined} />
      <InvoiceSection isAdmin={isAdmin} reloadKey={reloadKey} />
    </div>
  )
}
