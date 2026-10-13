'use client'
// src/components/app/attachments.tsx
// Attachments for a sales order, purchase order or transfer:
//  - AttachmentsModal: small popup to upload, open (new tab) and remove files
//  - AttachmentsBadge: paperclip + count shown in the order header when there is at least one file
import { useCallback, useEffect, useRef, useState } from 'react'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS_PER_ORDER, attachmentProblem, fmtSize, type AttachmentEntity } from '@/lib/attachments'
import { useCan } from '@/components/app/permissions-provider'

type Att = { id: string; file_name: string; content_type: string | null; size_bytes: number; uploaded_by_name: string | null; created_at: string }

const CHANGED = 'attachments-changed'

export function PaperclipIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

/** How many files are attached to this order. Refreshes whenever the popup adds or removes one. */
export function useAttachmentCount(type: AttachmentEntity, id: string): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    const load = () => {
      fetch(`/api/org/attachments?type=${type}&id=${id}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : []))
        .then(rows => { if (live && Array.isArray(rows)) setN(rows.length) })
        .catch(() => { /* leave the count as is */ })
    }
    load()
    const h = (e: Event) => { if ((e as CustomEvent).detail === id) load() }
    window.addEventListener(CHANGED, h)
    return () => { live = false; window.removeEventListener(CHANGED, h) }
  }, [type, id])
  return n
}

export function AttachmentsBadge({ type, id, label }: { type: AttachmentEntity; id: string; label: string }) {
  const n = useAttachmentCount(type, id)
  const [open, setOpen] = useState(false)
  if (n < 1 && !open) return null
  return (
    <>
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)} title={`${n} attachment${n === 1 ? '' : 's'}`}
        aria-label={`${n} attachment${n === 1 ? '' : 's'}`}
        style={{ height: 30, padding: '0 9px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600 }}>
        <PaperclipIcon />{n}
      </button>
      {open && <AttachmentsModal type={type} id={id} label={label} onClose={() => setOpen(false)} />}
    </>
  )
}

export function AttachmentsModal({ type, id, label, onClose }: { type: AttachmentEntity; id: string; label: string; onClose: () => void }) {
  const canAdd = useCan(type === 'sales' ? 'edit_sales' : type === 'purchases' ? 'edit_purchases' : 'edit_transfers')
  const canCreate = useCan(type === 'sales' ? 'create_sales' : type === 'purchases' ? 'create_purchases' : 'create_transfers')
  const canWrite = canAdd || canCreate
  const [rows, setRows] = useState<Att[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/org/attachments?type=${type}&id=${id}`, { cache: 'no-store' })
      .then(async r => ({ ok: r.ok, body: await r.json().catch(() => null) }))
      .then(({ ok, body }) => {
        if (!ok) { setError(body?.error ?? 'We couldn’t load the attachments. Please try again.'); return }
        setRows(Array.isArray(body) ? body : [])
      })
      .catch(() => setError('Network error — please try again.'))
  }, [type, id])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const tell = () => window.dispatchEvent(new CustomEvent(CHANGED, { detail: id }))

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setError(null)
    for (const f of list) {
      const problem = attachmentProblem(f)
      if (problem) { setError(problem); return }
    }
    if ((rows?.length ?? 0) + list.length > MAX_ATTACHMENTS_PER_ORDER) { setError(`An order can have up to ${MAX_ATTACHMENTS_PER_ORDER} attachments.`); return }
    setBusy(true)
    for (const f of list) {
      const fd = new FormData()
      fd.append('type', type); fd.append('id', id); fd.append('file', f)
      try {
        const r = await fetch('/api/org/attachments', { method: 'POST', body: fd })
        const body = await r.json().catch(() => ({}))
        if (!r.ok) { setError(body.error ?? `We couldn’t upload “${f.name}”. Please try again.`); break }
      } catch { setError(`We couldn’t upload “${f.name}” — please check your connection and try again.`); break }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
    load(); tell()
  }

  const remove = async (a: Att) => {
    setError(null); setRemoving(a.id)
    try {
      const r = await fetch(`/api/org/attachments/${a.id}`, { method: 'DELETE' })
      if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error ?? 'We couldn’t remove that file. Please try again.') }
    } catch { setError('Network error — please try again.') }
    setRemoving(null)
    load(); tell()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div role="dialog" aria-label="Attachments" onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 16, width: 'min(480px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 22px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)' }}>Attachments</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{label} · up to 2 MB per file</div>
          </div>
          <button className="sq-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 22px 20px' }}>
          {canWrite && (
            <div
              onDragOver={e => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); if (!busy) void upload(e.dataTransfer.files) }}
              style={{ border: `1.5px dashed ${over ? 'var(--blue, #2563EB)' : 'var(--gray-200)'}`, borderRadius: 12, padding: '16px 12px', textAlign: 'center', background: over ? 'var(--gray-50)' : undefined }}>
              <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} hidden onChange={e => e.target.files && void upload(e.target.files)} />
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => input.current?.click()} style={{ height: 34 }}>
                <PaperclipIcon />{busy ? 'Uploading…' : 'Choose files'}
              </button>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>or drop them here · PDF, pictures, Word, Excel, CSV and more</div>
            </div>
          )}

          {error && <div style={{ margin: '12px 0 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#B91C1C' }}>{error}</div>}

          <div style={{ marginTop: 10 }}>
            {!rows && !error && <div style={{ padding: '22px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>Loading…</div>}
            {rows && rows.length === 0 && <div style={{ padding: '22px 0', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>No attachments yet.</div>}
            {rows?.map(a => {
              const d = new Date(a.created_at)
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--gray-50)' }}>
                  <span style={{ color: 'var(--gray-400)', flexShrink: 0 }}><PaperclipIcon size={16} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <a href={`/api/org/attachments/${a.id}/file`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', textDecoration: 'none', overflowWrap: 'anywhere' }}>{a.file_name}</a>
                    <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 1 }}>
                      {fmtSize(a.size_bytes)} · {a.uploaded_by_name ?? 'Someone'} · {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {canWrite && (
                    <button className="sq-btn" aria-label={`Remove ${a.file_name}`} title="Remove" disabled={removing === a.id} onClick={() => void remove(a)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
