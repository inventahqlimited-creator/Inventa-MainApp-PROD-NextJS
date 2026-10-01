'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Hit = { group: string; id: string; label: string; sub: string; href: string }

const GROUP_BG: Record<string, string> = {
  Contacts: '#DBEAFE', Products: '#EDE9FE', Sales: '#D1FAE5', Purchases: '#FEF3C7', Transfers: '#E0F2FE',
}
const GROUP_FG: Record<string, string> = {
  Contacts: '#1E40AF', Products: '#5B21B6', Sales: '#047857', Purchases: '#92400E', Transfers: '#0369A1',
}

const ICONS: Record<string, React.ReactNode> = {
  Contacts: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Products: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  Sales: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Purchases: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  Transfers: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
}

const STYLE = `
.gs-panel{position:absolute;top:calc(100% + 6px);left:0;width:520px;max-width:calc(100vw - 32px);background:var(--white,#fff);border:1px solid rgba(0,0,0,0.08);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.15);z-index:800;overflow:hidden;max-height:480px;overflow-y:auto;padding:6px 0;}
.gs-section{padding:8px 16px 4px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gray-400,#9CA3AF);font-family:var(--font-ui);}
.gs-sep{height:1px;background:var(--gray-100,#F3F4F6);margin:6px 0;}
.gs-item{display:flex;align-items:center;gap:11px;padding:8px 16px;cursor:pointer;}
.gs-item:hover,.gs-item.gs-active{background:var(--gray-50,#F9FAFB);}
.gs-item-icon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.gs-item-name{font-size:13px;font-weight:600;color:var(--slate,#0F2D35);font-family:var(--font-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-item-sub{font-size:11.5px;color:var(--gray-400,#9CA3AF);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-empty{padding:22px 16px;text-align:center;font-size:13px;color:var(--gray-400,#9CA3AF);}
.gs-hint{padding:8px 16px 4px;font-size:11px;color:var(--gray-400,#9CA3AF);text-align:center;border-top:1px solid var(--gray-100,#F3F4F6);margin-top:6px;}
`

export default function GlobalSearch({ canViewProducts = true }: { canViewProducts?: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<Hit[]>([])
  const [searched, setSearched] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  // close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // "/" focuses the search box (when not typing somewhere else)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); inputRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // debounced search
  useEffect(() => {
    const term = q.trim()
    if (!term) { setHits([]); setSearched(false); setLoading(false); return }
    setLoading(true)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/org/search?q=${encodeURIComponent(term)}`)
        const data = res.ok ? await res.json() : { results: [] }
        if (mine !== seq.current) return           // a newer search has started
        setHits((data.results ?? []) as Hit[])
        setActive(0)
      } catch {
        if (mine === seq.current) setHits([])
      } finally {
        if (mine === seq.current) { setLoading(false); setSearched(true) }
      }
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const go = useCallback((h: Hit) => {
    setOpen(false)
    setQ('')
    setHits([])
    setSearched(false)
    inputRef.current?.blur()
    router.push(h.href)
  }, [router])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return }
    if (!hits.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + hits.length) % hits.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]) }
  }

  // group while keeping a flat index for keyboard highlight
  const groups: { name: string; items: { hit: Hit; idx: number }[] }[] = []
  hits.forEach((hit, idx) => {
    let g = groups.find(x => x.name === hit.group)
    if (!g) { g = { name: hit.group, items: [] }; groups.push(g) }
    g.items.push({ hit, idx })
  })

  const showPanel = open && q.trim().length > 0

  return (
    <div className="search-wrap" ref={wrapRef} style={{ position: 'relative' }}>
      <style>{STYLE}</style>
      <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        ref={inputRef}
        className="search-input"
        placeholder={canViewProducts ? 'Search contacts, products, orders…' : 'Search contacts, orders…'}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { if (q.trim()) setOpen(true) }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />

      {showPanel && (
        <div className="gs-panel" role="listbox">
          {loading && hits.length === 0 && <div className="gs-empty">Searching…</div>}
          {!loading && searched && hits.length === 0 && (
            <div className="gs-empty">No results for “<strong>{q.trim()}</strong>”</div>
          )}
          {groups.map((g, gi) => (
            <div key={g.name}>
              {gi > 0 && <div className="gs-sep" />}
              <div className="gs-section">{g.name}</div>
              {g.items.map(({ hit, idx }) => (
                <div
                  key={hit.group + hit.id}
                  className={`gs-item${idx === active ? ' gs-active' : ''}`}
                  role="option"
                  aria-selected={idx === active}
                  onMouseEnter={() => setActive(idx)}
                  onMouseDown={e => { e.preventDefault(); go(hit) }}
                >
                  <div className="gs-item-icon" style={{ background: GROUP_BG[hit.group], color: GROUP_FG[hit.group] }}>{ICONS[hit.group]}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="gs-item-name">{hit.label}</div>
                    {hit.sub && <div className="gs-item-sub">{hit.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {hits.length > 0 && <div className="gs-hint">↑↓ to move · Enter to open · Esc to close</div>}
        </div>
      )}
    </div>
  )
}
