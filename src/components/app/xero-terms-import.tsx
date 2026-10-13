'use client'
// src/components/app/xero-terms-import.tsx
// Settings → Integrations → Xero: import payment terms (organisation defaults + terms on contacts already linked to Xero).
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function XeroTermsImport({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function run() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/integrations/xero/payment-terms', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setConfirm(false)
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? 'Could not import payment terms from Xero.' }); return }
    setMsg({ ok: true, text: `Imported ${j.termsAdded} new payment term${j.termsAdded === 1 ? '' : 's'}. Updated terms on ${j.contactsUpdated} linked contact${j.contactsUpdated === 1 ? '' : 's'}.` })
    router.refresh()
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>Payment terms</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Bring in the payment terms from Xero and set them on contacts that are already linked. Contacts you imported from Xero get their terms automatically.</div>
        </div>
        {isAdmin && !confirm && <button className="btn btn-outline" style={{ height: 34, whiteSpace: 'nowrap' }} onClick={() => setConfirm(true)}>Import from Xero</button>}
      </div>
      {confirm && (
        <div style={{ marginTop: 14, padding: 14, background: 'var(--gray-50)', borderRadius: 10, fontSize: 13, color: 'var(--slate)' }}>
          This adds any Xero terms that aren’t in InventaHQ yet and replaces the payment terms on contacts linked to Xero with the terms set in Xero. Contacts with no terms in Xero are left alone.
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" style={{ height: 34 }} onClick={run} disabled={busy}>{busy ? 'Importing…' : 'Import payment terms'}</button>
            <button className="btn btn-outline" style={{ height: 34 }} onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 13, color: msg.ok ? 'var(--green, #15803d)' : 'var(--red, #b91c1c)' }}>{msg.text}</div>}
    </div>
  )
}
