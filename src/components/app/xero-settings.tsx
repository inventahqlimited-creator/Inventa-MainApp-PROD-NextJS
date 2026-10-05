'use client'
// src/components/app/xero-settings.tsx
// Settings → Integrations → Xero. Connect, choose the Xero organisation, disconnect.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import XeroMapping, { clearXeroMappingCache } from '@/components/app/xero-mapping'
import XeroPreferences from '@/components/app/xero-preferences'

export type XeroConnection = {
  status: 'pending' | 'connected' | 'needs_reconnect'
  tenant_name: string | null
  connected_at: string | null
  pending_tenants: { tenantId: string; tenantName: string }[] | null
} | null

export type XeroFlash = { ok?: string; error?: string }

const ERRORS: Record<string, string> = {
  not_configured: 'Xero isn’t set up on the server yet — the Xero keys are missing.',
  not_enabled: 'Xero isn’t switched on for your organisation.',
  admin_only: 'Only admins can connect Xero.',
  denied: 'The Xero sign-in was cancelled.',
  state: 'That sign-in couldn’t be verified. Please click Connect Xero and try again.',
  no_org: 'No Xero organisation was approved. Try again and tick the organisation you want to link.',
  failed: 'Something went wrong talking to Xero. Please try again.',
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

export default function XeroSettings({ isAdmin, connection, flash, onBack }: {
  isAdmin: boolean
  connection: XeroConnection
  flash?: XeroFlash
  onBack: () => void
}) {
  const router = useRouter()
  const [picked, setPicked] = useState<string>(connection?.pending_tenants?.[0]?.tenantId ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [error, setError] = useState<string | null>(flash?.error ? ERRORS[flash.error] ?? ERRORS.failed : null)
  const [ok, setOk] = useState<string | null>(flash?.ok === 'connected' ? 'Xero connected.' : null)

  const status = connection?.status ?? null
  const connect = () => { window.location.href = '/api/integrations/xero/connect' }

  async function call(method: 'POST' | 'DELETE', body?: object): Promise<boolean> {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch('/api/integrations/xero/organisation', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return false }
      return true
    } catch {
      setError('Network error — please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function link() {
    if (!picked) { setError('Pick the Xero organisation to link.'); return }
    if (await call('POST', { tenantId: picked })) {
      clearXeroMappingCache()
      setOk('Xero connected.')
      router.replace('/settings?tab=integrations&xero=1')
      router.refresh()
    }
  }

  async function disconnect() {
    if (await call('DELETE')) {
      clearXeroMappingCache()
      setConfirmOff(false)
      setOk(status === 'pending' ? null : 'Xero disconnected.')
      router.replace('/settings?tab=integrations&xero=1')
      router.refresh()
    }
  }

  return (
    <div>
      <button className="btn btn-outline" style={{ height: 30, fontSize: 12, marginBottom: 14 }} onClick={onBack}>← Integrations</button>

      {(error || ok) && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500,
          background: error ? '#FEF2F2' : '#ECFDF5', color: error ? '#B91C1C' : '#047857', border: `1px solid ${error ? '#FECACA' : '#A7F3D0'}` }}>
          {error ?? ok}
        </div>
      )}

      <Section title="Connection" subtitle="Link this organisation to one Xero organisation">
        {/* Not connected */}
        {!status && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', maxWidth: 520 }}>
              Connect your Xero organisation to post closed sales orders as invoices and received purchase orders as bills. You’ll sign in on Xero’s own page.
            </div>
            {isAdmin
              ? <button className="btn btn-primary" style={{ height: 38 }} onClick={connect}>Connect Xero</button>
              : <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Only admins can connect Xero.</span>}
          </div>
        )}

        {/* Signed in to Xero, more than one organisation approved: choose one */}
        {status === 'pending' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 4 }}>Choose the Xero organisation to link</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginBottom: 12 }}>You approved access to more than one. This organisation can link to one of them.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {(connection?.pending_tenants ?? []).map(t => (
                <label key={t.tenantId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', border: `1.5px solid ${picked === t.tenantId ? 'var(--teal, #0D9488)' : 'var(--gray-200)'}`, borderRadius: 10, cursor: 'pointer', background: 'var(--gray-50)' }}>
                  <input type="radio" name="xero-org" checked={picked === t.tenantId} onChange={() => setPicked(t.tenantId)} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)' }}>{t.tenantName}</span>
                </label>
              ))}
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ height: 38 }} onClick={link} disabled={busy}>{busy ? 'Linking…' : 'Link organisation'}</button>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={disconnect} disabled={busy}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Connected */}
        {status === 'connected' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>Connected to {connection?.tenant_name}</div>
                  {connection?.connected_at && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Since {fmtDate(connection.connected_at)}</div>}
                </div>
              </div>
              {isAdmin && !confirmOff && <button className="btn btn-outline" style={{ height: 34 }} onClick={() => setConfirmOff(true)}>Disconnect</button>}
            </div>
            {isAdmin && confirmOff && (
              <div style={{ marginTop: 16, padding: '14px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: '#7F1D1D', marginBottom: 12 }}>
                  Disconnect from {connection?.tenant_name}? Nothing already posted is removed from Xero, but documents will show as not synced again if you link a different organisation.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ height: 34, background: '#DC2626', borderColor: '#DC2626' }} onClick={disconnect} disabled={busy}>{busy ? 'Disconnecting…' : 'Yes, disconnect'}</button>
                  <button className="btn btn-outline" style={{ height: 34 }} onClick={() => setConfirmOff(false)} disabled={busy}>Keep connected</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Token could not be refreshed */}
        {status === 'needs_reconnect' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>Reconnect to {connection?.tenant_name ?? 'Xero'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>The link to Xero has expired. Sign in again to keep posting.</div>
              </div>
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ height: 34 }} onClick={connect}>Reconnect Xero</button>
                <button className="btn btn-outline" style={{ height: 34 }} onClick={disconnect} disabled={busy}>Disconnect</button>
              </div>
            )}
          </div>
        )}
      </Section>

      {status === 'connected' && <XeroMapping />}
      {status === 'connected' && <XeroPreferences />}

      {status !== 'connected' && (
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', padding: '0 4px' }}>
          Accounts, tax rates and import unlock once Xero is connected.
        </div>
      )}
    </div>
  )
}
