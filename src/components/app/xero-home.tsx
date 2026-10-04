// src/components/app/xero-home.tsx
// The Xero page in the left menu: set-up steps until connected, then the connection at a glance.
import Link from 'next/link'
import XeroDashboard from '@/components/app/xero-dashboard'

type Props = {
  status: 'pending' | 'connected' | 'needs_reconnect' | null
  tenantName: string | null
  isAdmin: boolean
}

// Sits directly under the page header card: same side margins, joined edge, rounded bottom corners.
const body: React.CSSProperties = { margin: '0 20px 20px', background: 'var(--white)', borderRadius: '0 0 16px 16px', boxShadow: 'var(--shadow-sm)', padding: '8px 22px 28px', borderTop: '1px solid var(--gray-100)' }
const inner: React.CSSProperties = { maxWidth: 640, paddingTop: 20 }
const SETTINGS = '/settings?tab=integrations&xero=1'

export default function XeroHome({ status, tenantName, isAdmin }: Props) {
  const connected = status === 'connected'
  return (
    <div>
      {/* The header card and the body below are one block: no gap, no margin collapse between them */}
      <div className="page-header-card" style={{ marginBottom: 0, paddingBottom: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, boxShadow: 'none' }}>
        <div className="page-header-top" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/integrations/xero.png" alt="Xero" width={44} height={44} style={{ borderRadius: 10, flexShrink: 0, display: 'block' }} />
            <div style={{ minWidth: 0 }}>
              <div className="page-title">Xero</div>
              <div className="page-subtitle">{connected ? `Connected to ${tenantName ?? 'Xero'}` : 'Accounting integration'}</div>
            </div>
          </div>
          <Link href={SETTINGS} className="btn btn-outline" style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            Settings
          </Link>
        </div>
      </div>

      <div style={body}>
        {!connected && (
          <div style={inner}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.01em', marginBottom: 6 }}>
              {status === 'needs_reconnect' ? 'Reconnect your Xero integration' : 'Finish setting up your Xero integration'}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--gray-500)', marginBottom: 20 }}>
              {status === 'needs_reconnect'
                ? 'The link to Xero has expired. Sign in again to keep posting invoices and bills.'
                : 'To start posting invoices and bills to Xero, connect your Xero organisation in settings.'}
            </div>
            <ol style={{ margin: '0 0 24px', paddingLeft: 20, fontSize: 13.5, color: 'var(--slate)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Go to <strong>Settings</strong> and open <strong>Integrations</strong>.</li>
              <li>Click <strong>Xero</strong>.</li>
              <li>{status === 'pending' ? <>Choose which Xero organisation to link.</> : <>Click <strong>{status === 'needs_reconnect' ? 'Reconnect Xero' : 'Connect Xero'}</strong> and sign in with Xero.</>}</li>
            </ol>
            <Link href={SETTINGS} className="btn btn-primary" style={{ height: 38, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Go to Xero settings</Link>
          </div>
        )}

        {connected && <div style={{ paddingTop: 20 }}><XeroDashboard isAdmin={isAdmin} /></div>}
      </div>
    </div>
  )
}
