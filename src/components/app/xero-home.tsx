// src/components/app/xero-home.tsx
// The Xero page in the left menu: set-up steps until connected, then the connection at a glance.
import Link from 'next/link'

type Props = {
  status: 'pending' | 'connected' | 'needs_reconnect' | null
  tenantName: string | null
}

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: 28, maxWidth: 640 }
const SETTINGS = '/settings?tab=integrations&xero=1'

export default function XeroHome({ status, tenantName }: Props) {
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

      <div style={{ padding: '20px 4px' }}>
        {!connected && (
          <div style={card}>
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

        {connected && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)' }}>Connected to {tenantName}</div>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--gray-500)', marginBottom: 20 }}>No sync activity yet.</div>
            <Link href={SETTINGS} className="btn btn-outline" style={{ height: 36, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Xero settings</Link>
          </div>
        )}
      </div>
    </div>
  )
}
