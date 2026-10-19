'use client'
// src/components/app/release-notes-modal.tsx
// The "What's new" popup opened from the notification bell.
import { useEffect } from 'react'
import type { ReleaseNote } from '@/lib/release-notes'

export const fmtReleaseDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ReleaseNotesModal({ release, onClose }: { release: ReleaseNote; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div role="dialog" aria-label="What's new" onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 16, width: 'min(600px, 92vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--teal)' }}>What’s new · {fmtReleaseDate(release.date)}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--slate)', marginTop: 3 }}>{release.title}</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.5 }}>{release.summary}</div>
          </div>
          <button className="sq-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 24px 22px' }}>
          {release.sections.map(s => (
            <div key={s.heading} style={{ marginTop: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>{s.heading}</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {s.items.map(t => <li key={t} style={{ fontSize: 13, color: 'var(--gray-600, #475569)', lineHeight: 1.55 }}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 24px 18px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ height: 34 }}>Got it</button>
        </div>
      </div>
    </div>
  )
}
