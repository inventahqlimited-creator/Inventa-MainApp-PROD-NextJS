'use client'
// src/components/app/report-viewer.tsx
// One screen that runs ANY report: filter bar, summary tiles, sortable table, column picker, and Print/PDF · CSV · Excel export.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { SECTIONS, defaultFilters, type Col, type FilterDef, type Filters, type FilterValue, type Opt, type ReportDef, type ReportResult, type Row } from '@/lib/reports/registry'
import type { Lookups } from '@/lib/reports/run'
import { buildXlsx, download, fileSafe, fmtDate, fmtTile, fmtValue, isNumeric, printReport, toCsv, totals } from '@/lib/reports/export'

const RECENT_KEY = 'inv-reports-recent'
const colsKey = (id: string) => `inv-report-cols:${id}`

// ───────────── small helpers
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function presets(): { id: string; label: string; from: string; to: string }[] {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth()
  const day = (n: number) => new Date(y, m, now.getDate() + n)
  const q0 = Math.floor(m / 3) * 3
  return [
    { id: 'today', label: 'Today', from: iso(now), to: iso(now) },
    { id: 'yesterday', label: 'Yesterday', from: iso(day(-1)), to: iso(day(-1)) },
    { id: '7', label: 'Last 7 days', from: iso(day(-6)), to: iso(now) },
    { id: '30', label: 'Last 30 days', from: iso(day(-29)), to: iso(now) },
    { id: 'month', label: 'This month', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { id: 'lastmonth', label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { id: 'quarter', label: 'This quarter', from: iso(new Date(y, q0, 1)), to: iso(new Date(y, q0 + 3, 0)) },
    { id: 'year', label: 'This year', from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) },
    { id: 'lastyear', label: 'Last year', from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) },
  ]
}

const GREEN = { bg: '#D1FAE5', fg: '#065F46' }, BLUE = { bg: '#DBEAFE', fg: '#1E40AF' }, GRAY = { bg: '#F3F4F6', fg: '#6B7280' }
const RED = { bg: '#FEE2E2', fg: '#991B1B' }, AMBER = { bg: '#FEF3C7', fg: '#92400E' }, PURPLE = { bg: '#EDE9FE', fg: '#5B21B6' }
function badgeColor(v: string) {
  const k = v.toLowerCase()
  if (['active', 'closed', 'ok', 'received'].includes(k)) return GREEN
  if (['cancelled', 'expired', 'out of stock', 'below minimum', 'inactive'].includes(k)) return RED
  if (['expiring soon', 'near minimum', 'supplier', 'partial stock', 'partially received', 'partially picked', 'no stock'].includes(k)) return AMBER
  if (['open', 'customer', 'stock', 'stock available', 'picked', 'packed'].includes(k)) return BLUE
  if (['picking', 'service'].includes(k)) return PURPLE
  return GRAY
}

const Chevron = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>

type Source = keyof Lookups

// ───────────── filter controls
function Pop({ open, children, align = 'left', width }: { open: boolean; children: React.ReactNode; align?: 'left' | 'right'; width?: number }) {
  if (!open) return null
  return (
    <div className="inv-dropdown" onClick={e => e.stopPropagation()}
      style={{ display: 'block', top: 'calc(100% + 6px)', [align]: 0, [align === 'left' ? 'right' : 'left']: 'auto', minWidth: width ?? 210, maxWidth: 340, padding: 8, zIndex: 500 }}>
      {children}
    </div>
  )
}

function SelectFilter({ def, options, value, onChange, open, setOpen }: { def: FilterDef; options: Opt[]; value: string; onChange: (v: string) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const [term, setTerm] = useState('')
  useEffect(() => { if (!open) setTerm('') }, [open])
  const label = options.find(o => o.value === value)?.label
  const shown = options.filter(o => o.label.toLowerCase().includes(term.toLowerCase())).slice(0, 120)
  const active = !!value && !def.noAll
  return (
    <div data-pop style={{ position: 'relative' }}>
      <button className={`filter-dd-btn${active ? ' active-filter' : ''}`} onClick={e => { e.stopPropagation(); setOpen(!open) }}>
        <span style={{ opacity: 0.75 }}>{def.label}{label ? ':' : ''}</span>{label && <strong style={{ fontWeight: 600, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</strong>}
        {!label && !def.noAll && <span style={{ opacity: 0.6 }}>All</span>}<Chevron />
      </button>
      <Pop open={open}>
        <div className="col-dropdown-title">{def.label}</div>
        {options.length > 7 && (
          <input autoFocus className="modal-input" style={{ height: 32, marginBottom: 6 }} placeholder="Search…" value={term} onChange={e => setTerm(e.target.value)} />
        )}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {!def.noAll && <div className={`fp-item${!value ? ' active' : ''}`} onClick={() => { onChange(''); setOpen(false) }}>All</div>}
          {shown.map(o => <div key={o.value} className={`fp-item${value === o.value ? ' active' : ''}`} onClick={() => { onChange(o.value); setOpen(false) }}>{o.label}</div>)}
          {shown.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--gray-400)' }}>{options.length === 0 ? 'Nothing to pick from yet' : 'No match'}</div>}
        </div>
      </Pop>
    </div>
  )
}

function MultiFilter({ def, options, value, onChange, open, setOpen }: { def: FilterDef; options: Opt[]; value: string[]; onChange: (v: string[]) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  const text = value.length === 0 ? 'All' : value.length === 1 ? options.find(o => o.value === value[0])?.label ?? value[0] : `${value.length} selected`
  return (
    <div data-pop style={{ position: 'relative' }}>
      <button className={`filter-dd-btn${value.length ? ' active-filter' : ''}`} onClick={e => { e.stopPropagation(); setOpen(!open) }}>
        <span style={{ opacity: 0.75 }}>{def.label}:</span><strong style={{ fontWeight: 600 }}>{text}</strong><Chevron />
      </button>
      <Pop open={open}>
        <div className="col-dropdown-title">{def.label}</div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {options.map(o => (
            <div key={o.value} className="fp-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => toggle(o.value)}>
              <input type="checkbox" readOnly checked={value.includes(o.value)} style={{ accentColor: 'var(--teal)' }} />{o.label}
            </div>
          ))}
        </div>
        {value.length > 0 && <div className="fp-item" style={{ color: 'var(--teal)', fontWeight: 600, marginTop: 4 }} onClick={() => onChange([])}>Clear</div>}
      </Pop>
    </div>
  )
}

function DateRangeFilter({ def, from, to, onChange, open, setOpen }: { def: FilterDef; from: string; to: string; onChange: (from: string, to: string) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const ps = presets()
  const hit = ps.find(p => p.from === from && p.to === to)
  const text = !from && !to ? 'Any time' : hit ? hit.label : `${from ? fmtDate(from) : '…'} – ${to ? fmtDate(to) : '…'}`
  return (
    <div data-pop style={{ position: 'relative' }}>
      <button className={`filter-dd-btn${from || to ? ' active-filter' : ''}`} onClick={e => { e.stopPropagation(); setOpen(!open) }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        <span style={{ opacity: 0.75 }}>{def.label}:</span><strong style={{ fontWeight: 600 }}>{text}</strong><Chevron />
      </button>
      <Pop open={open} width={250}>
        <div className="col-dropdown-title">{def.label}</div>
        <div className={`fp-item${!from && !to ? ' active' : ''}`} onClick={() => { onChange('', ''); setOpen(false) }}>Any time</div>
        {ps.map(p => <div key={p.id} className={`fp-item${hit?.id === p.id ? ' active' : ''}`} onClick={() => { onChange(p.from, p.to); setOpen(false) }}>{p.label}</div>)}
        <div style={{ borderTop: '1px solid var(--gray-100)', margin: '6px 0 8px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 2px 2px' }}>
          <label style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>From<input type="date" className="modal-input" style={{ height: 32, marginTop: 3, padding: '0 6px' }} value={from} onChange={e => onChange(e.target.value, to)} /></label>
          <label style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>To<input type="date" className="modal-input" style={{ height: 32, marginTop: 3, padding: '0 6px' }} value={to} onChange={e => onChange(from, e.target.value)} /></label>
        </div>
      </Pop>
    </div>
  )
}

// ───────────── the viewer
export default function ReportViewer({ def, lookups, orgName }: { def: ReportDef; lookups: Lookups; orgName: string }) {
  const section = SECTIONS.find(s => s.id === def.section)!
  const defaults = useMemo(() => defaultFilters(def), [def])
  const [filters, setFilters] = useState<Filters>(defaults)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [colPref, setColPref] = useState<Record<string, boolean>>({})
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const reqId = useRef(0)

  // remembered column choices
  useEffect(() => { try { const raw = localStorage.getItem(colsKey(def.id)); if (raw) setColPref(JSON.parse(raw)) } catch { /* ignore */ } }, [def.id])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      const ids = (raw ? (JSON.parse(raw) as string[]) : []).filter(x => x !== def.id)
      localStorage.setItem(RECENT_KEY, JSON.stringify([def.id, ...ids].slice(0, 6)))
    } catch { /* ignore */ }
  }, [def.id])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as Element)?.closest?.('[data-pop]')) setOpenKey(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  // which filters are showing right now (some appear only for certain choices)
  const effective = (k: string): FilterValue => (filters[k] !== undefined ? filters[k] : defaults[k])
  const visibleDefs = def.filters.filter(f => f.key !== 'q' && (!f.showWhen || f.showWhen.in.includes(String(effective(f.showWhen.key) ?? ''))))

  const payload = useMemo(() => {
    const out: Filters = {}
    const keys = new Set<string>()
    for (const f of visibleDefs) { if (f.kind === 'daterange') { keys.add(`${f.key}_from`); keys.add(`${f.key}_to`) } else keys.add(f.key) }
    // keep the values that decide which filters show
    for (const f of def.filters) if (f.showWhen) keys.add(f.showWhen.key)
    for (const k of keys) {
      const v = filters[k] !== undefined ? filters[k] : defaults[k]
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue
      out[k] = v
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, def, defaults])
  const payloadKey = JSON.stringify(payload)

  const run = useCallback(async (p: Filters) => {
    const id = ++reqId.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/org/reports/${def.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: p }) })
      const data = await res.json().catch(() => ({}))
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(data?.error || 'Could not run the report')
      setResult(data as ReportResult)
      setPage(1)
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Could not run the report')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [def.id])

  useEffect(() => { const t = setTimeout(() => run(JSON.parse(payloadKey)), 250); return () => clearTimeout(t) }, [payloadKey, run])

  const setF = (k: string, v: FilterValue) => setFilters(f => ({ ...f, [k]: v }))
  const optsFor = (f: FilterDef): Opt[] => f.options ?? (f.source ? lookups[f.source as Source] ?? [] : [])

  // columns the user can see
  const allCols: Col[] = result?.columns ?? []
  const isOn = (c: Col) => (colPref[c.key] !== undefined ? colPref[c.key] : !c.off)
  const cols = allCols.filter(c => c.required || isOn(c))
  const toggleCol = (c: Col) => {
    const next = { ...colPref, [c.key]: !isOn(c) }
    setColPref(next)
    try { localStorage.setItem(colsKey(def.id), JSON.stringify(next)) } catch { /* ignore */ }
  }

  // search + sort (on the rows already returned)
  const rows = useMemo(() => {
    let r: Row[] = result?.rows ?? []
    const term = search.trim().toLowerCase()
    if (term) r = r.filter(row => cols.some(c => { const v = row[c.key]; return v !== null && v !== undefined && fmtValue(c, v).toLowerCase().includes(term) }))
    if (sort) {
      const k = sort.key
      r = [...r].sort((a, b) => {
        const x = a[k], y = b[k]
        if (x === null || x === undefined || x === '') return 1
        if (y === null || y === undefined || y === '') return -1
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir
      })
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, search, sort, colPref])

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  const pageRows = rows.slice((page - 1) * perPage, page * perPage)
  const sums = useMemo(() => totals(cols, rows), [cols, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasSums = Object.keys(sums).length > 0

  // what's filtered, in words (for exports)
  const summary = (): string[] => {
    const out: string[] = []
    for (const f of visibleDefs) {
      if (f.kind === 'daterange') {
        const a = String(effective(`${f.key}_from`) ?? ''), b = String(effective(`${f.key}_to`) ?? '')
        if (a || b) out.push(`${f.label}: ${a ? fmtDate(a) : '…'} – ${b ? fmtDate(b) : '…'}`)
        continue
      }
      const v = effective(f.key)
      if (v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)) continue
      if (f.kind === 'toggle') out.push(f.label)
      else if (f.kind === 'multi') out.push(`${f.label}: ${(v as string[]).map(x => optsFor(f).find(o => o.value === x)?.label ?? x).join(', ')}`)
      else if (f.kind === 'select') out.push(`${f.label}: ${optsFor(f).find(o => o.value === v)?.label ?? v}`)
      else if (f.kind === 'date') out.push(`${f.label}: ${fmtDate(v)}`)
      else out.push(`${f.label}: ${v}`)
    }
    if (search.trim()) out.push(`Search: “${search.trim()}”`)
    return out
  }

  const doCsv = () => { if (!result) return; download(`${fileSafe(def.title)}-${iso(new Date())}.csv`, toCsv(cols, rows), 'text/csv;charset=utf-8'); setOpenKey(null) }
  const doXlsx = () => {
    if (!result) return
    const sub = [`${orgName} · generated ${new Date().toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}`, ...(summary().length ? [summary().join('  ·  ')] : [])]
    download(`${fileSafe(def.title)}-${iso(new Date())}.xlsx`, buildXlsx({ title: def.title, subtitle: sub, cols, rows }) as unknown as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setOpenKey(null)
  }
  const doPrint = () => {
    if (!result) return
    const ok = printReport({ org: orgName, title: def.title, subtitle: summary(), cols, rows, note: result.note })
    if (!ok) setToast('Your browser blocked the print window — allow pop-ups for this site and try again.')
    setOpenKey(null)
  }

  // reset
  const isDefault = JSON.stringify(payload) === JSON.stringify((() => { const o: Filters = {}; for (const [k, v] of Object.entries(defaults)) if (v !== undefined && v !== '') o[k] = v; return o })())
  const moreDefs = visibleDefs.filter(f => !f.primary)
  const primaryDefs = visibleDefs.filter(f => f.primary)
  const moreActive = moreDefs.filter(f => {
    if (f.kind === 'daterange') return !!(effective(`${f.key}_from`) || effective(`${f.key}_to`))
    const v = effective(f.key)
    return v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0) && v !== defaults[f.key]
  }).length

  const renderFilter = (f: FilterDef) => {
    const open = openKey === f.key
    const setOpen = (o: boolean) => setOpenKey(o ? f.key : null)
    switch (f.kind) {
      case 'daterange':
        return <DateRangeFilter key={f.key} def={f} from={String(effective(`${f.key}_from`) ?? '')} to={String(effective(`${f.key}_to`) ?? '')} open={open} setOpen={setOpen}
          onChange={(a, b) => setFilters(x => ({ ...x, [`${f.key}_from`]: a, [`${f.key}_to`]: b }))} />
      case 'select':
        return <SelectFilter key={f.key} def={f} options={optsFor(f)} value={String(effective(f.key) ?? '')} onChange={v => setF(f.key, v)} open={open} setOpen={setOpen} />
      case 'multi':
        return <MultiFilter key={f.key} def={f} options={optsFor(f)} value={(effective(f.key) as string[] | undefined) ?? []} onChange={v => setF(f.key, v)} open={open} setOpen={setOpen} />
      case 'toggle': {
        const on = effective(f.key) === true
        return (
          <button key={f.key} className={`filter-dd-btn${on ? ' active-filter' : ''}`} onClick={() => setF(f.key, !on)} title={f.hint}>
            <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${on ? 'var(--teal)' : 'var(--gray-200)'}`, background: on ? 'var(--teal)' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </span>{f.label}
          </button>
        )
      }
      case 'number':
        return (
          <label key={f.key} className={`filter-dd-btn${effective(f.key) !== undefined && effective(f.key) !== '' ? ' active-filter' : ''}`} style={{ cursor: 'text' }} title={f.hint}>
            <span style={{ opacity: 0.75 }}>{f.label}</span>
            <input type="number" min="0" value={effective(f.key) === undefined ? '' : String(effective(f.key))} placeholder={f.placeholder ?? '—'} onChange={e => setF(f.key, e.target.value)}
              style={{ width: 64, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'var(--slate)', fontWeight: 600 }} />
          </label>
        )
      case 'date':
        return (
          <label key={f.key} className={`filter-dd-btn${effective(f.key) ? ' active-filter' : ''}`} style={{ cursor: 'pointer' }} title={f.hint}>
            <span style={{ opacity: 0.75 }}>{f.label}:</span>
            <input type="date" value={String(effective(f.key) ?? '')} onChange={e => setF(f.key, e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'var(--slate)', fontWeight: 600 }} />
          </label>
        )
      default:
        return null
    }
  }

  const firstLoad = loading && !result
  const dim = loading && !!result
  const alignOf = (c: Col) => (isNumeric(c) ? 'right' : 'left')

  return (
    <div>
      <style>{`
        @keyframes rpShimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        .rp-skel{height:14px;border-radius:6px;background:linear-gradient(90deg,#F0F0EE 25%,#F8FAFA 50%,#F0F0EE 75%);background-size:800px 100%;animation:rpShimmer 1.2s infinite linear;}
        .rp-tile{background:var(--gray-50);border:1px solid var(--gray-100);border-radius:12px;padding:12px 14px;min-width:0;}
        .rp-tile-l{font-size:11px;font-weight:600;color:var(--gray-400);letter-spacing:0.02em;}
        .rp-tile-v{font-family:var(--font-display);font-size:21px;font-weight:800;color:var(--slate);letter-spacing:-0.03em;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .rp-link{color:var(--teal);font-weight:600;text-decoration:none;} .rp-link:hover{text-decoration:underline;}
        .rp-bar{position:absolute;left:0;top:0;height:2px;width:35%;background:var(--teal);animation:rpBar 1s infinite ease-in-out;}
        @keyframes rpBar{0%{left:-35%}100%{left:100%}}
        .rp-tr:hover td{background:var(--teal-surface);}
        @media (prefers-reduced-motion:reduce){.rp-skel,.rp-bar{animation:none;}}
      `}</style>

      <div className="page-header-card" style={{ paddingBottom: 18 }}>
        <div className="page-header-top" style={{ marginBottom: 14 }}>
          <div>
            <Link href="/reports" className="rp-link" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Reports <span style={{ color: 'var(--gray-400)', fontWeight: 500 }}>/ {section.title}</span>
            </Link>
            <div className="page-title">{def.title}</div>
            <div className="page-subtitle">{def.desc}</div>
          </div>
          <div className="page-header-actions">
            <div data-pop style={{ position: 'relative' }}>
              <button className="btn btn-outline" disabled={!result} onClick={e => { e.stopPropagation(); setOpenKey(openKey === 'cols' ? null : 'cols') }}>Columns</button>
              <Pop open={openKey === 'cols'} align="right" width={230}>
                <div className="col-dropdown-title">Columns</div>
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {allCols.map(c => (
                    <div key={c.key} className="fp-item" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: c.required ? 0.5 : 1, cursor: c.required ? 'default' : 'pointer' }} onClick={() => { if (!c.required) toggleCol(c) }}>
                      <input type="checkbox" readOnly checked={c.required || isOn(c)} style={{ accentColor: 'var(--teal)' }} />{c.label}
                    </div>
                  ))}
                </div>
              </Pop>
            </div>
            <div data-pop style={{ position: 'relative' }}>
              <button className="btn btn-primary" disabled={!result || rows.length === 0} onClick={e => { e.stopPropagation(); setOpenKey(openKey === 'export' ? null : 'export') }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Export<Chevron />
              </button>
              <Pop open={openKey === 'export'} align="right" width={230}>
                <div className="col-dropdown-title">Export these {rows.length} rows</div>
                {[
                  { label: 'Print / Save as PDF', sub: 'Opens a clean print view', fn: doPrint },
                  { label: 'Excel (.xlsx)', sub: 'Formatted, with totals', fn: doXlsx },
                  { label: 'CSV (.csv)', sub: 'Plain data for any tool', fn: doCsv },
                ].map(x => (
                  <div key={x.label} className="fp-item" onClick={x.fn} style={{ padding: '8px 10px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--slate)' }}>{x.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{x.sub}</div>
                  </div>
                ))}
              </Pop>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
          {(result?.tiles ?? (firstLoad ? [0, 1, 2, 3].map(() => null) : [])).map((t, i) => (
            <div key={i} className="rp-tile" style={{ opacity: dim ? 0.6 : 1, transition: 'opacity 150ms' }}>
              {t ? <><div className="rp-tile-l">{t.label}{t.hint ? <span style={{ fontWeight: 500 }}> · {t.hint}</span> : ''}</div><div className="rp-tile-v" title={String(t.value)}>{fmtTile(t.value, t.type)}</div></>
                : <><div className="rp-skel" style={{ width: '55%' }} /><div className="rp-skel" style={{ width: '75%', height: 22, marginTop: 8 }} /></>}
            </div>
          ))}
        </div>
      </div>

      <div className="filter-bar-card" style={{ position: 'relative', zIndex: 20 }}>
        {primaryDefs.map(renderFilter)}
        {moreDefs.length > 0 && (
          <button className={`filter-dd-btn${moreOpen || moreActive ? ' active-filter' : ''}`} onClick={() => setMoreOpen(o => !o)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
            More filters{moreActive > 0 && <span style={{ background: 'var(--teal)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>{moreActive}</span>}
          </button>
        )}
        {!isDefault && <button className="btn-sm btn-sm-ghost" onClick={() => { setFilters(defaults); setSearch('') }}>Reset</button>}
        <div className="filter-spacer" />
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input className="filter-search" placeholder="Search these results…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
      </div>
      {moreOpen && moreDefs.length > 0 && (
        <div className="filter-bar-card" style={{ position: 'relative', zIndex: 19, background: 'var(--gray-50)', paddingTop: 10, paddingBottom: 10 }}>
          {moreDefs.map(renderFilter)}
        </div>
      )}

      <div className="table-container" style={{ position: 'relative' }}>
        {dim && <div className="rp-bar" />}
        <div className="table-toolbar">
          <span className="table-count"><strong>{rows.length.toLocaleString('en-NZ')}</strong> {rows.length === 1 ? 'row' : 'rows'}{result && rows.length !== result.rows.length ? ` of ${result.rows.length.toLocaleString('en-NZ')}` : ''}</span>
          {result?.note && <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 'auto', textAlign: 'right', maxWidth: '62%' }} title={result.note}>ⓘ {result.note}</span>}
        </div>
        {result?.truncated && <div style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12.5, padding: '8px 18px', fontWeight: 600 }}>This report is very large, so only the first 20,000 records were used. Narrow it with filters for complete figures.</div>}
        {error && (
          <div style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 13, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 600 }}>
            {error}<button className="btn-sm btn-sm-ghost" onClick={() => run(payload)}>Try again</button>
          </div>
        )}

        <div className="table-wrap" style={{ opacity: dim ? 0.55 : 1, transition: 'opacity 150ms' }}>
          {firstLoad ? (
            <div style={{ padding: '18px 18px' }}>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="rp-skel" style={{ marginBottom: 16, width: `${92 - (i % 3) * 12}%` }} />)}</div>
          ) : result && rows.length === 0 && !error ? (
            <div style={{ textAlign: 'center', padding: '64px 20px' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: section.bg, color: section.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)' }}>Nothing to show</div>
              <div style={{ fontSize: 13, color: 'var(--gray-400)', margin: '4px 0 14px' }}>No records match these filters.</div>
              {(!isDefault || search) && <button className="btn btn-outline" onClick={() => { setFilters(defaults); setSearch('') }}>Reset filters</button>}
            </div>
          ) : result ? (
            <table>
              <thead>
                <tr>
                  {cols.map(c => {
                    const sorted = sort?.key === c.key
                    return (
                      <th key={c.key} className={`sortable${sorted ? ' sorted' : ''}`} style={{ textAlign: alignOf(c), whiteSpace: 'nowrap' }}
                        onClick={() => c.type !== 'blank' && setSort(s => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                        {c.label}{sorted && <span style={{ marginLeft: 5, color: 'var(--teal)' }}>{sort!.dir === 1 ? '↑' : '↓'}</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={i} className="rp-tr">
                    {cols.map((c, ci) => {
                      const v = r[c.key]
                      let content: React.ReactNode
                      if (c.type === 'badge' && v) { const b = badgeColor(String(v)); content = <span className="badge" style={{ background: b.bg, color: b.fg }}>{String(v)}</span> }
                      else if (c.type === 'blank') content = <span style={{ display: 'inline-block', width: 70, height: 18, borderBottom: '1.5px solid var(--gray-200)' }} />
                      else if (ci === 0 && r._href) content = <Link href={r._href} className="rp-link">{fmtValue(c, v)}</Link>
                      else content = fmtValue(c, v)
                      const muted = v === null || v === undefined || v === ''
                      return (
                        <td key={c.key} style={{ textAlign: alignOf(c), fontVariantNumeric: isNumeric(c) ? 'tabular-nums' : undefined, color: muted ? 'var(--gray-400)' : ci === 0 ? 'var(--slate)' : undefined, fontWeight: ci === 0 && !r._href ? 600 : undefined, whiteSpace: c.type === 'text' ? undefined : 'nowrap', maxWidth: c.type === 'text' ? 280 : undefined }}>
                          {content}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {hasSums && (
                <tfoot>
                  <tr>
                    {cols.map((c, i) => (
                      <td key={c.key} style={{ textAlign: alignOf(c), padding: '11px 14px', fontWeight: 700, color: 'var(--slate)', background: 'var(--gray-50)', borderTop: '2px solid var(--gray-200)', position: 'sticky', bottom: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {i === 0 ? 'Total' : c.sum ? fmtValue(c, sums[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          ) : null}
        </div>

        <div className="table-footer">
          <div className="footer-left">
            <span className="per-page-label">Rows per page</span>
            <select className="per-page-select" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}>
              {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="per-page-label" style={{ marginLeft: 8 }}>Page {page} of {totalPages}</span>
          </div>
          <div className="pagination">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next page"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg></button>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--slate)', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: 'var(--shadow-lg)', zIndex: 900 }}>{toast}</div>}
    </div>
  )
}
