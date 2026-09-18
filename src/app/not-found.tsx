import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--gray-50)', fontFamily: 'var(--font-display)' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 72, fontWeight: 800, color: 'var(--teal)', letterSpacing: '-0.04em', lineHeight: 1 }}>404</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--slate)', marginTop: 12, letterSpacing: '-0.02em' }}>Page not found</div>
        <div style={{ fontSize: 14, color: 'var(--gray-400)', marginTop: 8, lineHeight: 1.6 }}>The page you're looking for doesn't exist or has been moved.</div>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 24, background: 'var(--teal)', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, textDecoration: 'none', letterSpacing: '-0.01em' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
