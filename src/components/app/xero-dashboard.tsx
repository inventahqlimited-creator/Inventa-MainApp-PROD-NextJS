'use client'
// src/components/app/xero-dashboard.tsx
// The connected Xero page: a "Sync now" bar (with last full sync and next automatic sync), then two columns:
// contacts | products, invoices | bills, and stock adjustments. Each shows counts, what failed, and a button to sync that part.
import { useCallback, useEffect, useState } from 'react'
import type { Overview } from '@/lib/xero/sync'
import { SCHEDULE_LABELS, SCOPE_LABELS, STOCK_ERROR_PREFIX, type Schedule, type Scope } from '@/lib/xero/prefs'

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
    <div className="xero-stat">
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--gray-400)', lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 2, fontFamily: 'var(--font-display)', color: tone === 'bad' && Number(value) > 0 ? '#B91C1C' : tone === 'good' ? '#047857' : 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

/** A titled list. Past 5 records it stops growing and scrolls instead. `rowH` is the height of one row. */
function ListBlock({ title, hint, children, count = 0, rowH = 38 }: { title: string; hint?: string; children: React.ReactNode; count?: number; rowH?: number }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--gray-400)', margin: '2px 0 8px' }}>{hint}</div>}
      {count > 5
        ? <div style={{ maxHeight: rowH * 5, overflowY: 'auto', paddingRight: 8, borderTop: '1px solid var(--gray-50)' }}>{children}</div>
        : children}
    </div>
  )
}

const cardStyle: React.CSSProperties = { border: '1px solid var(--gray-100)', borderRadius: 14, padding: '20px 22px 22px', minWidth: 0, background: 'var(--white)' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--gray-50)', fontSize: 13, color: 'var(--slate)' }

function Section({ entity, isAdmin, reloadKey, onChanged }: { entity: Entity; isAdmin: boolean; reloadKey: number; onChanged: () => void }) {
  const l = LABEL[entity]
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'sync' | 'import' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

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
        {isAdmin && <button className="btn btn-outline" style={{ height: 32 }} disabled={busy !== null} onClick={() => void sync()}>{busy === 'sync' ? 'Syncing…' : `Sync ${l.many}`}</button>}
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
          <div className="xero-stats">
            <Tile label="In InventaHQ" value={data.inventa} />
            <Tile label="In Xero" value={data.xero} />
            <Tile label="Synced" value={data.synced} tone="good" />
            <Tile label="Not synced" value={data.notSynced} />
            <Tile label="Failed" value={data.failed} tone="bad" />
          </div>

          {data.failures.length > 0 && (
            <ListBlock title={`Failed (${data.failures.length})`} hint="Fix the reason, then sync again." count={data.failures.length} rowH={56}>
              {data.failures.map(f => (
                <div key={f.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: '#B91C1C' }}>{f.error}</span>
                </div>
              ))}
            </ListBlock>
          )}

          {data.onlyInInventa.length > 0 && (
            <ListBlock title={`Only in InventaHQ (${data.onlyInInventa.length})`} hint={`These ${l.many} will be created in Xero when you sync.`} count={data.onlyInInventa.length}>
              {data.onlyInInventa.map(i => <div key={i.id} style={rowStyle}>{i.name}</div>)}
            </ListBlock>
          )}

          {data.onlyInXero.length > 0 && (
            <ListBlock title={`Only in Xero (${data.onlyInXero.length})`} hint={isAdmin ? `Tick the ${l.many} you want to bring into InventaHQ. Nothing is imported automatically.` : `Not in InventaHQ. An admin can import them.`}>
              <div style={{ maxHeight: data.onlyInXero.length > 5 ? 38 * 5 + 2 : undefined, overflowY: 'auto', border: '1px solid var(--gray-100)', borderRadius: 10, padding: '0 12px' }}>
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
            data.notSynced > 0
              ? <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 14 }}>{data.notSynced} {l.many} will be linked to Xero the next time you sync.</div>
              : <div style={{ fontSize: 13, color: '#047857', marginTop: 14 }}>Nothing needs attention.</div>
          )}
          {data.sharedKey > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 14, lineHeight: 1.5 }}>
              {data.sharedKey} {data.sharedKey === 1 ? `${l.one} in InventaHQ shares` : `${l.many} in InventaHQ share`} {entity === 'contact' ? 'a name' : 'a SKU'} with another {l.one}. Xero keeps one record for each {entity === 'contact' ? 'name' : 'item code'}, so they share it. That is why InventaHQ shows {data.inventa} and Xero shows {data.xero}.
            </div>
          )}
        </>
      )}
    </div>
  )
}


type BulkSummary = { posted: number; failed: number; remaining: number; failures: { id: string; name: string; error: string }[]; stopped?: string }
type Kind = 'invoice' | 'bill' | 'adjustment'
type PostData = {
  eligible: number; posted: number; notPosted: number; failed: number
  failures: { id: string; name: string; error: string | null }[]
  waiting: { id: string; name: string }[]
  recent: { id: string; number: string; total: number; postedAt: string; url: string; customer?: string; supplier?: string; location?: string }[]
  lastPostedAt: string | null
  tracked?: boolean; needsAccounts?: boolean; skipped?: number
  manual?: { id: string; name: string }[]; manualCount?: number
}

/** A failure's reason. A "not enough stock in Xero" refusal shows a short label and the full advice on hover. */
function FailText({ error }: { error: string | null }) {
  if (!error) return null
  if (error.startsWith(STOCK_ERROR_PREFIX)) {
    return <span title={error} style={{ fontSize: 12, color: '#B91C1C', cursor: 'help', textDecoration: 'underline dotted' }}>Not enough stock in Xero ⓘ</span>
  }
  return <span style={{ fontSize: 12, color: '#B91C1C' }}>{error}</span>
}
const KIND = {
  invoice: { title: 'Invoices', source: 'Closed sales orders', noun: 'invoice', route: '/api/integrations/xero/invoice', href: '/sales', total: 'Closed orders', who: 'customer' as const,
    empty: 'No closed sales orders yet. Close an order, then post it here or from its Actions menu.' },
  bill: { title: 'Bills', source: 'Closed purchase orders', noun: 'bill', route: '/api/integrations/xero/bill', href: '/purchases', total: 'Closed orders', who: 'supplier' as const,
    empty: 'No closed purchase orders with received stock yet. Receive and close an order, then post it here or from its Actions menu.' },
  adjustment: { title: 'Stock adjustments', source: 'Completed stock adjustments', noun: 'journal', route: '/api/integrations/xero/adjustment', href: '/products/adjustments', total: 'Completed', who: 'location' as const,
    empty: 'No completed stock adjustments since stock adjustments were switched on for Xero.' },
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
  const [data, setData] = useState<PostData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/integrations/xero/overview?entity=${kind}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? `Could not load ${k.title.toLowerCase()} (the server answered ${res.status}).`); return }
      setData(body as PostData)
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
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
            {data?.tracked
              ? 'Xero tracks your inventory, so stock adjustments are not sent.'
              : <>{k.source} post to Xero{postStatus ? ` as ${postStatus === 'AUTHORISED' || postStatus === 'POSTED' ? (kind === 'adjustment' ? '' : 'approved ') : 'draft '}${k.noun}s` : ''}. Last posted: {data ? when(data.lastPostedAt) : '…'}</>}
          </div>
        </div>
        {isAdmin && !data?.tracked && <button className="btn btn-outline" style={{ height: 32 }} disabled={busy} onClick={() => void sync()}>{busy ? 'Posting…' : `Sync ${k.title.toLowerCase()}`}</button>}
      </div>

      {notice && <div style={{ ...noticeStyle(notice), marginBottom: 14 }}>{notice.text}</div>}
      {error && <div style={{ fontSize: 13, color: '#B91C1C' }}>{error}</div>}
      {!error && !data && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}

      {data?.tracked && (
        <>
          <div style={{ padding: '12px 14px', borderRadius: 10, fontSize: 13, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', lineHeight: 1.5 }}>
            Stock adjustments will need to be posted in Xero manually.
          </div>
          {(data.manualCount ?? 0) > 0 && (
            <ListBlock title={`To post in Xero (${data.manualCount})`} hint="Completed since you said Xero tracks your inventory." count={(data.manual ?? []).length}>
              {(data.manual ?? []).map(w => (
                <div key={w.id} style={rowStyle}>
                  <a href={`${k.href}/${w.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--slate)' }}>{w.name} ↗</a>
                </div>
              ))}
              {(data.manualCount ?? 0) > (data.manual ?? []).length && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>and {(data.manualCount ?? 0) - (data.manual ?? []).length} more</div>}
            </ListBlock>
          )}
        </>
      )}

      {data && !data.tracked && (
        <>
          {data.needsAccounts && (
            <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 12.5, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', lineHeight: 1.5 }}>
              Choose the inventory asset and stock adjustment accounts in Settings → Xero → Accounts and tax. Adjustments wait until then.
            </div>
          )}
          <div className="xero-stats">
            <Tile label={k.total} value={data.eligible} />
            <Tile label="Posted" value={data.posted} tone="good" />
            <Tile label="Not posted" value={data.notPosted} />
            <Tile label="Failed" value={data.failed} tone="bad" />
          </div>

          {data.failures.length > 0 && (
            <ListBlock title={`Failed (${data.failures.length})`} hint={`Fix the reason, then post again from the order or with Sync ${k.title.toLowerCase()}.`} count={data.failures.length} rowH={56}>
              {data.failures.map(f => (
                <div key={f.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <a href={`${k.href}/${f.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--slate)' }}>{f.name} ↗</a>
                  <FailText error={f.error} />
                </div>
              ))}
            </ListBlock>
          )}

          {data.waiting.length > 0 && (
            <ListBlock title={`Waiting to post (${data.waiting.length})`} hint={`These will post when you sync ${k.title.toLowerCase()}.`} count={data.waiting.length}>
              {data.waiting.map(w => (
                <div key={w.id} style={rowStyle}>
                  <a href={`${k.href}/${w.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--slate)' }}>{w.name} ↗</a>
                </div>
              ))}
            </ListBlock>
          )}

          {data.recent.length > 0 && (
            <ListBlock title="Recently posted" count={data.recent.length}>
              {data.recent.map(r => {
                const rr = r
                return (
                  <div key={rr.id} style={rowStyle}>
                    <span style={{ fontWeight: 600, minWidth: 80 }}><a href={`${k.href}/${rr.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--slate)' }} title={`Open in InventaHQ`}>{rr.number}</a></span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.who === 'customer' ? rr.customer : k.who === 'supplier' ? rr.supplier : rr.location}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>${rr.total.toFixed(2)}</span>
                    {rr.url && <a href={rr.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--teal)', whiteSpace: 'nowrap' }}>Xero ↗</a>}
                  </div>
                )
              })}
            </ListBlock>
          )}

          {data.eligible === 0 && !data.needsAccounts && <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 14 }}>{k.empty}</div>}
          {kind === 'adjustment' && (data.skipped ?? 0) > 0 && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>{data.skipped} marked “Don’t send to Xero”.</div>}
        </>
      )}
    </div>
  )
}

type PrefsInfo = { prefs: { schedule: Schedule; scope: Scope; invoice_status: string; bill_status: string; journal_status: string; inventory_tracked: boolean }; lastFullSyncAt: string | null; nextSyncAt: string | null; timezone: string }
type RunPart = { posted: number; failed: number }
type RunReport = { done: boolean; stopped?: string; contacts?: SyncSummary; products?: SyncSummary; invoices?: RunPart; bills?: RunPart; adjustments?: RunPart & { note?: string } }

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
        if (r.adjustments) {
          if (r.adjustments.note) lines.push(`Stock adjustments: ${r.adjustments.note}`)
          else { lines.push(postText('adjustment', r.adjustments)); if (r.adjustments.failed) bad = true }
        }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 22px', background: 'var(--gray-50)', border: '1px solid var(--gray-100)', borderRadius: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>Sync everything</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>
            {info?.prefs.inventory_tracked
              ? 'Sends new contacts, then products, then received purchase orders (bills) and closed sales orders (invoices) to Xero. Stock adjustments are posted in Xero manually.'
              : 'Sends new contacts, then products, then closed sales orders (invoices), received purchase orders (bills) and stock adjustments (journals) to Xero.'}
          </div>
          {info && (
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 22px' }}>
              <span>Last full sync: <span style={{ color: 'var(--slate)', fontWeight: 400 }}>{when(info.lastFullSyncAt)}</span></span>
              {auto
                ? <span>Next sync: <span style={{ color: 'var(--slate)', fontWeight: 400 }}>{when(info.nextSyncAt)}</span> ({SCHEDULE_LABELS[info.prefs.schedule].toLowerCase()} · {SCOPE_LABELS[info.prefs.scope].toLowerCase().replace(/ \(.*\)/, '')})</span>
                : <span>Automatic sync is off (manual).</span>}
            </div>
          )}
        </div>
        {isAdmin
          ? <button className="btn btn-primary" style={{ height: 38, paddingInline: 22 }} disabled={busy} onClick={() => void syncAll()}>{busy ? 'Syncing…' : 'Sync now'}</button>
          : <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Only admins can sync.</span>}
      </div>
      {notice && <div style={{ ...noticeStyle(notice), marginTop: 12 }}>{notice.text}</div>}

      <div className="xero-grid" style={{ marginTop: 22 }}>
        <style>{'.xero-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:start}@media(max-width:820px){.xero-grid{grid-template-columns:minmax(0,1fr)}}.xero-stats{display:flex;border:1px solid var(--gray-100);border-radius:12px;overflow:hidden}.xero-stat{flex:1 1 0;min-width:0;padding:11px 14px;background:var(--white)}.xero-stat+.xero-stat{border-left:1px solid var(--gray-100)}'}</style>
        <Section entity="contact" isAdmin={isAdmin} reloadKey={reloadKey} onChanged={() => undefined} />
        <Section entity="product" isAdmin={isAdmin} reloadKey={reloadKey} onChanged={() => undefined} />
        <PostSection kind="invoice" isAdmin={isAdmin} reloadKey={reloadKey} postStatus={info?.prefs.invoice_status} />
        <PostSection kind="bill" isAdmin={isAdmin} reloadKey={reloadKey} postStatus={info?.prefs.bill_status} />
        <PostSection kind="adjustment" isAdmin={isAdmin} reloadKey={reloadKey} postStatus={info?.prefs.journal_status} />
      </div>
    </div>
  )
}
