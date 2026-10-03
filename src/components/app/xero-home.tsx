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
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Xero</div>
            <div className="page-subtitle">{connected ? `Connected to ${tenantName ?? 'Xero'}` : 'Accounting integration'}</div>
          </div>
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
