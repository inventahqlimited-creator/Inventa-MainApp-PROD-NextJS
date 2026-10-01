'use client'
// src/components/app/reports-home.tsx
// The Reports landing page: every report grouped by section, with search and a "recently run" strip.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { REPORTS, SECTIONS, type ReportDef } from '@/lib/reports/registry'

const RECENT_KEY = 'inv-reports-recent'

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={`M${p}`} />)}
    </svg>
  )
}

export default function ReportsHome() {
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      const ids = raw ? (JSON.parse(raw) as string[]) : []
      setRecent(ids.filter(id => REPORTS.some(r => r.id === id)).slice(0, 4))
    } catch { /* storage unavailable — no recent strip */ }
  }, [])

  const term = q.trim().toLowerCase()
  const matches = (r: ReportDef) => {
    if (!term) return true
    const s = SECTIONS.find(x => x.id === r.section)
    return `${r.title} ${r.desc} ${s?.title ?? ''}`.toLowerCase().includes(term)
  }
  const sectionOf = (id: string) => SECTIONS.find(s => s.id === id)!
  const shown = useMemo(() => REPORTS.filter(matches), [term]) // eslint-disable-line react-hooks/exhaustive-deps
  const recentDefs = recent.map(id => REPORTS.find(r => r.id === id)).filter((r): r is ReportDef => !!r)

  const Card = ({ r }: { r: ReportDef }) => {
    const s = sectionOf(r.section)
    const nFilters = r.filters.filter(f => f.key !== 'q').length
    return (
      <Link href={`/reports/${r.id}`} className="rp-card" style={{ ['--c' as string]: s.color, ['--bg' as string]: s.bg }}>
        <span className="rp-ico"><Icon d={s.icon} /></span>
        <span className="rp-body">
          <span className="rp-title">{r.title}</span>
          <span className="rp-desc">{r.desc}</span>
          <span className="rp-meta">{nFilters} filters · CSV · Excel · PDF</span>
        </span>
        <span className="rp-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
      </Link>
    )
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{`
        .rp-hero{background:linear-gradient(135deg,var(--slate) 0%,var(--slate-mid) 60%,#0D9488 140%);border-radius:18px;padding:26px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;color:#fff;box-shadow:var(--shadow-sm);}
        .rp-hero h1{font-family:var(--font-display);font-size:26px;font-weight:800;letter-spacing:-0.03em;margin:0;}
        .rp-hero p{margin:4px 0 0;font-size:13.5px;color:rgba(255,255,255,0.72);max-width:520px;}
        .rp-search{position:relative;width:min(340px,100%);}
        .rp-search input{width:100%;height:42px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.12);color:#fff;padding:0 14px 0 38px;font-size:13.5px;font-family:var(--font-ui);outline:none;transition:background var(--transition),border-color var(--transition);}
        .rp-search input::placeholder{color:rgba(255,255,255,0.6);}
        .rp-search input:focus{background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.55);}
        .rp-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.7);pointer-events:none;}
        .rp-sec-head{display:flex;align-items:center;gap:12px;margin:0 0 12px;}
        .rp-sec-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--c);}
        .rp-sec-title{font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--slate);letter-spacing:-0.02em;line-height:1.1;}
        .rp-sec-blurb{font-size:12px;color:var(--gray-400);margin-top:2px;}
        .rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;}
        .rp-card{position:relative;display:flex;gap:14px;align-items:flex-start;background:var(--white);border:1.5px solid var(--gray-100);border-radius:14px;padding:16px 44px 16px 16px;text-decoration:none;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,0.03);transition:transform var(--transition),box-shadow var(--transition),border-color var(--transition);}
        .rp-card:hover{transform:translateY(-2px);border-color:var(--c);box-shadow:0 10px 28px rgba(15,45,53,0.10);}
        .rp-ico{flex:none;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--c);}
        .rp-body{display:flex;flex-direction:column;gap:3px;min-width:0;}
        .rp-title{font-family:var(--font-display);font-size:14.5px;font-weight:700;color:var(--slate);letter-spacing:-0.01em;}
        .rp-desc{font-size:12.5px;line-height:1.45;color:#6B7280;}
        .rp-meta{font-size:11px;color:var(--gray-400);margin-top:5px;font-weight:500;}
        .rp-arrow{position:absolute;right:14px;top:50%;transform:translate(-4px,-50%);color:var(--c);opacity:0;transition:opacity var(--transition),transform var(--transition);}
        .rp-card:hover .rp-arrow{opacity:1;transform:translate(0,-50%);}
        .rp-chip{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 10px;border-radius:999px;background:var(--white);border:1.5px solid var(--gray-200);font-size:13px;font-weight:600;color:var(--slate);text-decoration:none;font-family:var(--font-display);transition:border-color var(--transition),background var(--transition);}
        .rp-chip:hover{border-color:var(--c);background:var(--bg);}
        .rp-chip i{width:8px;height:8px;border-radius:50%;background:var(--c);}
        @media (prefers-reduced-motion:reduce){.rp-card,.rp-arrow{transition:none;}}
      `}</style>

      <div className="rp-hero">
        <div>
          <h1>Reports</h1>
          <p>Pick a report, narrow it down with filters, then print it or export to CSV or Excel.</p>
        </div>
        <div className="rp-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a report…" aria-label="Find a report" />
        </div>
      </div>

      {!term && recentDefs.length > 0 && (
        <div>
          <div className="rp-sec-blurb" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10.5 }}>Recently run</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentDefs.map(r => {
              const s = sectionOf(r.section)
              return <Link key={r.id} href={`/reports/${r.id}`} className="rp-chip" style={{ ['--c' as string]: s.color, ['--bg' as string]: s.bg }}><i />{r.title}</Link>
            })}
          </div>
        </div>
      )}

      {SECTIONS.map(s => {
        const list = shown.filter(r => r.section === s.id)
        if (!list.length) return null
        return (
          <section key={s.id} style={{ ['--c' as string]: s.color, ['--bg' as string]: s.bg }}>
            <div className="rp-sec-head">
              <span className="rp-sec-ico"><Icon d={s.icon} size={17} /></span>
              <div><div className="rp-sec-title">{s.title}</div><div className="rp-sec-blurb">{s.blurb}</div></div>
            </div>
            <div className="rp-grid">{list.map(r => <Card key={r.id} r={r} />)}</div>
          </section>
        )
      })}

      {shown.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--gray-400)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)' }}>No report matches “{q}”</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Try a word like stock, sales, supplier or expiry.</div>
        </div>
      )}
    </div>
  )
}
