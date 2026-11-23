'use client'
// src/components/app/order-history.tsx
// "Order History" popup for a sales order, purchase order or transfer: every Audit Log entry for that order,
// newest first — who created it, what changed, picked, packed, received, closed, and posted to Xero.
import { useEffect, useState } from 'react'

type Ev = { id: string; created_at: string; category: string; action: string; ref: string | null; detail: string | null; user_name: string | null; email_id?: string }

type SentEmail = {
  id: string; created_at: string; status: string; error: string | null; sent_by_name: string | null; from: string | null; reply_to: string | null
  to: string[]; cc: string[]; bcc: string[]; subject: string; attachments: { name: string; size: number }[]; html: string | null; body_note: string | null
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)

/** The exact email that was sent: recipients, subject, attachments and the message as the customer saw it. */
function EmailView({ id, onClose }: { id: string; onClose: () => void }) {
  const [mail, setMail] = useState<SentEmail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/org/email/log/${id}`, { cache: 'no-store' })
      .then(async r => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (!live) return; if (!ok) setError(body.error ?? 'Could not load the email.'); else setMail(body as SentEmail) })
      .catch(() => live && setError('Network error — please try again.'))
    return () => { live = false }
  }, [id])
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 10, padding: '5px 0', fontSize: 13 }}>
      <div style={{ color: 'var(--gray-400)', fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--slate)', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
  const list = (a: string[]) => (a.length ? a.join(', ') : <span style={{ color: 'var(--gray-300)' }}>—</span>)
  const d = mail ? new Date(mail.created_at) : null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div role="dialog" aria-label="Email" onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 16, width: 'min(720px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 24px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Email {mail && <span style={{ background: mail.status === 'sent' ? '#D1FAE5' : '#FEE2E2', color: mail.status === 'sent' ? '#065F46' : '#B91C1C', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>{mail.status === 'sent' ? 'Sent' : 'Failed'}</span>}
            </div>
            {d && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })} at {d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}{mail?.sent_by_name ? ` · sent by ${mail.sent_by_name}` : ''}</div>}
          </div>
          <button className="sq-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 24px 22px' }}>
          {error && <div style={{ margin: '8px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
          {!error && !mail && <div style={{ padding: '28px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>Loading…</div>}
          {mail && (
            <>
              {mail.error && <div style={{ margin: '4px 0 10px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>Not delivered: {mail.error}</div>}
              <div style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: 8 }}>
                {row('From', mail.from ?? '—')}
                {row('To', list(mail.to))}
                {row('CC', list(mail.cc))}
                {row('BCC', list(mail.bcc))}
                {mail.reply_to && row('Reply-to', mail.reply_to)}
                {row('Subject', <strong>{mail.subject}</strong>)}
                {row('Attachments', mail.attachments.length === 0 ? <span style={{ color: 'var(--gray-300)' }}>None</span> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {mail.attachments.map((a, i) => (
                      <span key={i} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '3px 9px', fontSize: 12 }}>📎 {a.name} <span style={{ color: 'var(--gray-400)' }}>({fmtSize(Number(a.size) || 0)})</span></span>
                    ))}
                  </div>
                ))}
              </div>
              {mail.html ? (
                // the message exactly as sent, in a locked-down frame so it can't run anything or touch this page
                <iframe title="Message" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${mail.html}`}
                  style={{ width: '100%', height: 360, border: '1px solid var(--gray-100)', borderRadius: 10, marginTop: 14, background: '#fff' }} />
              ) : (
                <div style={{ marginTop: 14, padding: '18px', background: 'var(--gray-50)', borderRadius: 10, fontSize: 13, color: 'var(--gray-500)' }}>{mail.body_note}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const TONE: Record<string, [string, string]> = {
  Sales: ['#DBEAFE', '#1E40AF'], Purchases: ['#EDE9FE', '#5B21B6'], Inventory: ['#D1FAE5', '#065F46'],
  Transfers: ['#FEF3C7', '#92400E'], Xero: ['#CFFAFE', '#155E75'], Email: ['#FFEDD5', '#9A3412'],
}
const FAILED = ['#FEE2E2', '#B91C1C'] as [string, string]

export default function OrderHistory({ type, id, label, onClose }: { type: 'sales' | 'purchase' | 'transfer'; id: string; label: string; onClose: () => void }) {
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewEmail, setViewEmail] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/org/history?type=${type}&id=${id}`, { cache: 'no-store' })
      .then(async r => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!live) return
        if (!ok) { setError(body.error ?? 'Could not load the history.'); return }
        setEvents(body.events ?? [])
      })
      .catch(() => live && setError('Network error — please try again.'))
    return () => { live = false }
  }, [type, id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (viewEmail) setViewEmail(null); else onClose() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, viewEmail])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div role="dialog" aria-label="Order history" onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 16, width: 'min(680px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)' }}>Order History</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{label} · every change, newest first</div>
          </div>
          <button className="sq-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 24px 20px' }}>
          {error && <div style={{ margin: '16px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}
          {!error && !events && <div style={{ padding: '28px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>Loading…</div>}
          {events && events.length === 0 && <div style={{ padding: '28px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>No history has been recorded for this order yet.</div>}
          {events?.map(e => {
            const [bg, color] = /failed/i.test(e.action) ? FAILED : TONE[e.category] ?? ['#F1F5F9', '#475569']
            const d = new Date(e.created_at)
            return (
              <div key={e.id} className="hist-row" style={{ display: 'grid', gridTemplateColumns: '112px 1fr auto', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--gray-50)', alignItems: 'start' }}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--slate)' }}>{d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>{e.action}</span>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>by <strong style={{ color: 'var(--slate)', fontWeight: 600 }}>{e.user_name ?? 'System'}</strong></span>
                  </div>
                  {e.detail && <div style={{ fontSize: 12.5, color: 'var(--gray-500)', lineHeight: 1.5, marginTop: 5, overflowWrap: 'anywhere' }}>{e.detail}</div>}
                </div>
                <div>{e.email_id && <button type="button" className="hist-view" onClick={() => setViewEmail(e.email_id!)}>View</button>}</div>
              </div>
            )
          })}
        </div>
      </div>
      {viewEmail && <EmailView id={viewEmail} onClose={() => setViewEmail(null)} />}
    </div>
  )
}
