'use client'
// src/components/app/xero-dashboard.tsx
// The connected Xero page: a "Sync now" bar (with last full sync and next automatic sync), then two columns:
// contacts | products, and invoices | bills. Each shows counts, what failed, and a button to sync that part.
import { useCallback, useEffect, useState } from 'react'
import type { Overview } from '@/lib/xero/sync'
import type { InvoiceOverview } from '@/lib/xero/invoice'
import type { BillOverview } from '@/lib/xero/bill'
import { SCHEDULE_LABELS, SCOPE_LABELS, type Schedule, type Scope } from '@/lib/xero/prefs'

type Entity = 'contact' | 'product'
type SyncSummary = { linked: number; created: number; failed: number; unchanged: number; failures: { id: string; name: string; error: string }[] }
type Notice = { kind: 'ok' | 'err'; text: string } | null

const LABEL: Record<Entity, { one: string; many: string; code: string }> = {
  contact: { one: 'contact', many: 'contacts', code: '' },
  product: { one: 'product', many: 'products', code: 'SKU' },
}

// All times are shown in the organisation's time zone (Settings), not the browser's.
let ORG_TZ: string | undefined
const when = (iso: string | null) => {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ORG_TZ })
  } catch {
    return new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
}

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

const cardStyle: React.CSSProperties = { border: '1px solid var(--gray-100)', borderRadius: 12, padding: 18, minWidth: 0 }
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
      if (!res.ok) { setError(body.error ?? `Could not load from Xero (the server answered ${res.status}).`); return }
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
    <div style={cardStyle}>
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
            <Tile label="In InventaHQ" value={data.inventa} />
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
            <ListBlock title={`Only in InventaHQ (${data.onlyInInventa.length})`} hint={`These ${l.many} will be created in Xero when you sync.`}>
              {(showAllInv ? data.onlyInInventa : data.onlyInInventa.slice(0, 8)).map(i => <div key={i.id} style={rowStyle}>{i.name}</div>)}
              {data.onlyInInventa.length > 8 && (
                <button className="btn btn-outline" style={{ height: 28, fontSize: 12, marginTop: 8 }} onClick={() => setShowAllInv(s => !s)}>
                  {showAllInv ? 'Show fewer' : `Show all ${data.onlyInInventa.length}`}
                </button>
              )}
            </ListBlock>
          )}

          {data.onlyInXero.length > 0 && (
            <ListBlock title={`Only in Xero (${data.onlyInXero.length})`} hint={isAdmin ? `Tick the ${l.many} you want to bring into InventaHQ. Nothing is imported automatically.` : `Not in InventaHQ. An admin can import them.`}>
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
            <div style={{ fontSize: 13, color: '#047857', marginTop: 14 }}>Everything matches between InventaHQ and Xero.</div>
          )}
        </>
      )}
    </div>
  )
}


type BulkSummary = { posted: number; failed: number; remaining: number; failures: { id: string; name: string; error: string }[]; stopped?: string }
type Kind = 'invoice' | 'bill'
const KIND = {
  invoice: { title: 'Invoices', source: 'Closed sales orders', noun: 'invoice', route: '/api/integrations/xero/invoice', href: '/sales', total: 'Closed orders', who: 'customer' as const,
    empty: 'No closed sales orders yet. Close an order, then post it here or from its Actions menu.' },
  bill: { title: 'Bills', source: 'Closed purchase orders', noun: 'bill', route: '/api/integrations/xero/bill', href: '/purchases', total: 'Closed orders', who: 'supplier' as const,
    empty: 'No closed purchase orders with received stock yet. Receive and close an order, then post it here or from its Actions menu.' },
}

/** Posts in batches of 20 until none are left (or Xero asks us to slow down). */
async function runPosts(kind: Kind): Promise<{ ok: true; posted: number; failed: number; failures: BulkSummary['failures'] } | { ok: false; error: string }> {
  let posted = 0, failed = 0
  const failures: BulkSummary['failures'] = []
  for (let round = 0; round < 15; round++) {
    let body: BulkSummary & { error?: string }
    try {
      const res = await fetch(KIND[kind].route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
      body = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: body.error ?? `Posting ${KIND[kind].title.toLowerCase()} failed.` }
    } catch {
      return { ok: false, error: 'Network error — please try again.' }
    }
    posted += body.posted; failed += body.failed; failures.push(...body.failures)
    if (body.stopped) return { ok: false, error: `${body.stopped} ${posted} posted so far.` }
    if (body.remaining <= 0 || body.posted + body.failed === 0) break
  }
  return { ok: true, posted, failed, failures }
}

const postText = (kind: Kind, r: { posted: number; failed: number }) =>
  r.posted === 0 && r.failed === 0 ? `${KIND[kind].title}: nothing new to post.` : `${KIND[kind].title}: ${r.posted} posted${r.failed ? `, ${r.failed} failed` : ''}.`

function PostSection({ kind, isAdmin, reloadKey, postStatus }: { kind: Kind; isAdmin: boolean; reloadKey: number; postStatus?: string }) {
  const k = KIND[kind]
  const [data, setData] = useState<(InvoiceOverview & BillOverview) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/integrations/xero/overview?entity=${kind}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? `Could not load ${k.title.toLowerCase()} (the server answered ${res.status}).`); return }
      setData(body as InvoiceOverview & BillOverview)
    } catch {
      setError('Network error — please try again.')
    }
  }, [kind, k.title])
  useEffect(() => { void load() }, [load, reloadKey])

  async function sync() {
    setBusy(true); setNotice(null)
    const r = await runPosts(kind)
    setBusy(false)
    setNotice(r.ok ? { kind: r.failed ? 'err' : 'ok', text: postText(kind, r) } : { kind: 'err', text: r.error })
    await load()
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)' }}>{k.title}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{k.source} post to Xero{postStatus ? ` as ${postStatus === 'AUTHORISED' ? 'approved' : 'draft'} ${k.noun}s` : ''}. Last posted: {data ? when(data.lastPostedAt) : '…'}</div>
        </div>
        {isAdmin && <button className="btn btn-primary" style={{ height: 34 }} disabled={busy} onClick={() => void sync()}>{busy ? 'Posting…' : `Sync ${k.title.toLowerCase()}`}</button>}
      </div>

      {notice && <div style={{ ...noticeStyle(notice), marginBottom: 14 }}>{notice.text}</div>}
      {error && <div style={{ fontSize: 13, color: '#B91C1C' }}>{error}</div>}
      {!error && !data && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Tile label={k.total} value={data.eligible} />
            <Tile label="Posted" value={data.posted} tone="good" />
            <Tile label="Not posted" value={data.notPosted} />
            <Tile label="Failed" value={data.failed} tone="bad" />
          </div>

          {data.failures.length > 0 && (
            <ListBlock title={`Failed (${data.failures.length})`} hint={`Fix the reason, then post again from the order or with Sync ${k.title.toLowerCase()}.`}>
              {data.failures.map(f => (
                <div key={f.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <a href={`${k.href}/${f.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--slate)' }}>{f.name} ↗</a>
                  <span style={{ fontSize: 12, color: '#B91C1C' }}>{f.error}</span>
                </div>
              ))}
            </ListBlock>
          )}

          {data.waiting.length > 0 && (
            <ListBlock title={`Waiting to post (${data.waiting.length})`} hint={`These will post when you sync ${k.title.toLowerCase()}.`}>
              {data.waiting.slice(0, 8).map(w => (
                <div key={w.id} style={rowStyle}>
                  <a href={`${k.href}/${w.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--slate)' }}>{w.name} ↗</a>
                </div>
              ))}
              {data.waiting.length > 8 && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>and {data.waiting.length - 8} more</div>}
            </ListBlock>
          )}

          {data.recent.length > 0 && (
            <ListBlock title="Recently posted">
              {data.recent.map(r => {
                const rr = r as { id: string; number: string; total: number; postedAt: string; url: string; customer?: string; supplier?: string }
                return (
                  <div key={rr.id} style={rowStyle}>
                    <span style={{ fontWeight: 600, minWidth: 80 }}><a href={`${k.href}/${rr.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--slate)' }} title={`Open in InventaHQ`}>{rr.number}</a></span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.who === 'customer' ? rr.customer : rr.supplier}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>${rr.total.toFixed(2)}</span>
                    {rr.url && <a href={rr.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--teal)', whiteSpace: 'nowrap' }}>Xero ↗</a>}
                  </div>
                )
              })}
            </ListBlock>
          )}

          {data.eligible === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 14 }}>{k.empty}</div>}
        </>
      )}
    </div>
  )
}

type PrefsInfo = { prefs: { schedule: Schedule; scope: Scope; invoice_status: string; bill_status: string }; lastFullSyncAt: string | null; nextSyncAt: string | null; timezone: string }
type RunPart = { posted: number; failed: number }
type RunReport = { done: boolean; stopped?: string; contacts?: SyncSummary; products?: SyncSummary; invoices?: RunPart; bills?: RunPart }

export default function XeroDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [info, setInfo] = useState<PrefsInfo | null>(null)

  const loadInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/xero/preferences', { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as PrefsInfo
      ORG_TZ = body.timezone
      setInfo(body)
    } catch { /* the bar just shows no times */ }
  }, [])
  useEffect(() => { void loadInfo() }, [loadInfo])

  async function syncAll() {
    setBusy(true); setNotice(null)
    const lines: string[] = []
    let bad = false
    const skip: string[] = []
    let rep: RunReport | null = null
    let error: string | null = null
    for (let round = 0; round < 8; round++) {
      try {
        const res = await fetch('/api/integrations/xero/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'full', skip }) })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { error = body.error ?? `Sync failed (the server answered ${res.status}).`; break }
        const r = body as RunReport
        if (r.contacts) { lines.push(summaryText('contact', r.contacts)); if (r.contacts.failed) bad = true; skip.push('contacts') }
        if (r.products) { lines.push(summaryText('product', r.products)); if (r.products.failed) bad = true; skip.push('products') }
        if (r.invoices) { lines.push(postText('invoice', r.invoices)); if (r.invoices.failed) bad = true }
        if (r.bills) { lines.push(postText('bill', r.bills)); if (r.bills.failed) bad = true }
        rep = r
        if (r.done || r.stopped) break
      } catch {
        error = 'Network error — please try again.'
        break
      }
    }
    if (error) { lines.push(error); bad = true }
    else if (rep?.stopped) { lines.push(rep.stopped); bad = true }
    else if (rep && !rep.done) { lines.push('Some items are still waiting. Click Sync now again to carry on.'); bad = true }
    setBusy(false)
    setNotice({ kind: bad ? 'err' : 'ok', text: lines.join(' ') })
    setReloadKey(k => k + 1)
    void loadInfo()
  }

  const auto = info && info.prefs.schedule !== 'manual'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 16px', background: 'var(--gray-50)', border: '1px solid var(--gray-100)', borderRadius: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, color: 'var(--slate)' }}>Sync everything</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Sends new contacts, then products, then closed sales orders (invoices) and received purchase orders (bills) to Xero.</div>
          {info && (
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
              <span><strong style={{ color: 'var(--slate)' }}>Last full sync:</strong> {when(info.lastFullSyncAt)}</span>
              {auto
                ? <span><strong style={{ color: 'var(--slate)' }}>Next sync:</strong> {when(info.nextSyncAt)} <span style={{ color: 'var(--gray-400)' }}>({SCHEDULE_LABELS[info.prefs.schedule].toLowerCase()} · {SCOPE_LABELS[info.prefs.scope].toLowerCase().replace(/ \(.*\)/, '')})</span></span>
                : <span style={{ color: 'var(--gray-400)' }}>Automatic sync is off (manual).</span>}
            </div>
          )}
        </div>
        {isAdmin
          ? <button className="btn btn-primary" style={{ height: 38 }} disabled={busy} onClick={() => void syncAll()}>{busy ? 'Syncing…' : 'Sync now'}</button>
          : <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Only admins can sync.</span>}
      </div>
      {notice && <div style={{ ...noticeStyle(notice), marginTop: 12 }}>{notice.text}</div>}

      <div className="xero-grid" style={{ marginTop: 18 }}>
        <style>{'.xero-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}@media(max-width:820px){.xero-grid{grid-template-columns:minmax(0,1fr)}}'}</style>
        <Section entity="contact" isAdmin={isAdmin} reloadKey={reloadKey} onChanged={() => undefined} />
        <Section entity="product" isAdmin={isAdmin} reloadKey={reloadKey} onChanged={() => undefined} />
        <PostSection kind="invoice" isAdmin={isAdmin} reloadKey={reloadKey} postStatus={info?.prefs.invoice_status} />
        <PostSection kind="bill" isAdmin={isAdmin} reloadKey={reloadKey} postStatus={info?.prefs.bill_status} />
      </div>
    </div>
  )
}
