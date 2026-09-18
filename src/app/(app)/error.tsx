'use client'

import { useEffect } from 'react'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)', fontFamily: 'var(--font-display)' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.02em' }}>Something went wrong</div>
        <div style={{ fontSize: 13.5, color: 'var(--gray-400)', marginTop: 8, lineHeight: 1.6 }}>An unexpected error occurred loading this page.</div>
        {error.digest && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8, fontFamily: 'monospace' }}>Error ID: {error.digest}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button onClick={reset} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.33"/></svg>
            Try Again
          </button>
          <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--white)', color: 'var(--slate)', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: '1.5px solid var(--gray-200)', textDecoration: 'none' }}>
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
