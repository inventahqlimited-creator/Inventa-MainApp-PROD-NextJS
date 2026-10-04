'use client'
// src/components/app/xero-sync-ui.tsx
// Shared pieces for the Contacts and Products tables: the Xero status badge, the "Post to Xero" button,
// and the hook that sends one record. Only used when Xero is switched on and connected.
import { useState } from 'react'

export type XeroRowInfo = { status: 'synced' | 'failed'; error?: string | null; url?: string | null }
export type XeroMessage = { kind: 'ok' | 'err'; text: string; href?: string | null }
export type XeroTableInfo = {
  show: boolean      // Xero is switched on and connected: show the Xero column
  canPost: boolean   // the user is an admin: show Post to Xero
  records: Record<string, XeroRowInfo>
}

export function XeroStatusBadge({ info }: { info?: XeroRowInfo | null }) {
  if (info?.status === 'synced') return <span className="badge" title={info.error ?? undefined} style={{ background: info.error ? '#FEF3C7' : '#D1FAE5', color: info.error ? '#92400E' : '#065F46', cursor: info.error ? 'help' : undefined }}>{info.error ? 'Synced ⚠' : 'Synced'}</span>
  if (info?.status === 'failed') return <span className="badge" title={info.error ?? 'Failed'} style={{ background: '#FEE2E2', color: '#991B1B', cursor: 'help' }}>Failed</span>
  return <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>Not synced</span>
}

export const XeroColumnHeader = () => <th>Xero</th>

/** Sends one record to Xero. Returns the new status so the table can update its row. */
export function usePostToXero(entity: 'contact' | 'product' | 'invoice', onResult: (id: string, info: XeroRowInfo) => void) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<XeroMessage | null>(null)

  async function post(id: string) {
    setBusyId(id)
    setMessage(null)
    try {
      const res = await fetch(entity === 'invoice' ? '/api/integrations/xero/invoice' : '/api/integrations/xero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entity === 'invoice' ? { id } : { entity, id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ kind: 'err', text: body.error ?? 'Could not post to Xero.' })
        if (body.recorded) onResult(id, { status: 'failed', error: body.error })
        return
      }
      if (entity === 'invoice') {
        onResult(id, { status: 'synced', error: body.warning ?? null, url: body.url ?? null })
        setMessage({ kind: 'ok', text: `Posted to Xero as draft invoice ${body.number}.${body.warning ? ` ${body.warning}` : ''}`, href: body.url ?? null })
        return
      }
      const failure = (body.failures as { id: string; error: string }[] | undefined)?.find(f => f.id === id)
      if (failure) {
        onResult(id, { status: 'failed', error: failure.error })
        setMessage({ kind: 'err', text: failure.error })
      } else {
        onResult(id, { status: 'synced' })
        setMessage({ kind: 'ok', text: 'Posted to Xero.' })
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — please try again.' })
    } finally {
      setBusyId(null)
    }
  }

  return { post, busyId, message, clearMessage: () => setMessage(null) }
}

export function PostToXeroButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button className="row-action-btn" disabled={busy} onClick={e => { e.stopPropagation(); onClick() }} title="Post to Xero" style={busy ? { opacity: 0.5 } : undefined}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>
    </button>
  )
}

/** A short notice under the page header after a post: green on success, red with Xero's reason on failure. */
export function XeroPostNotice({ message, onClose, flush }: { message: XeroMessage | null; onClose: () => void; flush?: boolean }) {
  if (!message) return null
  return (
    <div style={{ margin: flush ? '0 0 20px' : '12px 20px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between', gap: 12,
      background: message.kind === 'ok' ? '#ECFDF5' : '#FEF2F2', color: message.kind === 'ok' ? '#047857' : '#B91C1C', border: `1px solid ${message.kind === 'ok' ? '#A7F3D0' : '#FECACA'}` }}>
      <span>{message.text}{message.href && <> <a href={message.href} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700 }}>Open in Xero →</a></>}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }} aria-label="Dismiss">×</button>
    </div>
  )
}
