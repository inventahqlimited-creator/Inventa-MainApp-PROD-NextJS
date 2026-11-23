'use client'
// Every document "Print" first asks what the person wants: Download (a PDF file) or Print (the browser's print dialog).
// Cancel, the cross, Esc or a click outside all do nothing.
import { createRoot } from 'react-dom/client'
import type { DocType } from '@/lib/pdf'

export type PrintChoice = 'print' | 'download' | 'cancel'
type Result = { ok: true } | { ok: false; error: string }

export function askPrintChoice(label: string, canDownload = true): Promise<PrintChoice> {
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = (c: PrintChoice) => { root.unmount(); host.remove(); window.removeEventListener('keydown', onKey); resolve(c) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish('cancel') }
    window.addEventListener('keydown', onKey)
    const btn = { height: 40, padding: '0 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 } as const
    root.render(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={() => finish('cancel')}>
        <div role="dialog" aria-label={`Print ${label}`} onMouseDown={e => e.stopPropagation()}
          style={{ background: 'var(--white, #fff)', borderRadius: 16, width: 'min(400px, 92vw)', padding: '20px 24px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)' }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>{canDownload ? 'Download a PDF or print it?' : 'Print it?'}</div>
            </div>
            <button className="sq-btn" aria-label="Cancel" onClick={() => finish('cancel')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            {canDownload && (
              <button autoFocus onClick={() => finish('download')} style={{ ...btn, flex: 1, justifyContent: 'center', border: '1px solid var(--gray-200)', background: 'var(--white, #fff)', color: 'var(--slate)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" /></svg>Download
              </button>
            )}
            <button autoFocus={!canDownload} onClick={() => finish('print')} style={{ ...btn, flex: 1, justifyContent: 'center', border: 'none', background: 'var(--teal)', color: '#fff' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>Print
            </button>
          </div>
        </div>
      </div>,
    )
  })
}

/** Downloads one PDF per id (several orders arrive as several files). */
export async function downloadPdfs(type: DocType, ids: string[], overrides?: unknown): Promise<Result> {
  for (const id of ids) {
    try {
      const res = await fetch('/api/org/documents/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, overrides: overrides && typeof overrides === 'object' ? (overrides as Record<string, unknown>)[id] !== undefined ? { [id]: (overrides as Record<string, unknown>)[id] } : overrides : undefined }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); return { ok: false, error: d.error ?? 'Could not build the PDF' } }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'document.pdf'
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      if (ids.length > 1) await new Promise(r => setTimeout(r, 400))
    } catch { return { ok: false, error: 'Network error — please try again.' } }
  }
  return { ok: true }
}

/** Asks, then either downloads, cancels quietly, or tells the caller to carry on and print. */
export async function choosePrint(label: string, type: DocType | null, ids: string[], overrides?: unknown): Promise<Result | 'print'> {
  const c = await askPrintChoice(label, type !== null)
  if (c === 'cancel') return { ok: true }
  if (c === 'download' && type) return downloadPdfs(type, ids, overrides)
  return 'print'
}
