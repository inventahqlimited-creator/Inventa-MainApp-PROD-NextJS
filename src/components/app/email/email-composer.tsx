'use client'
import { useEffect, useRef, useState } from 'react'
import RichEditor from './rich-editor'
import { fillPlaceholders, PLACEHOLDERS } from '@/lib/email/render'

type Sig = { id: string; name: string; body_html: string; is_default: boolean }
type Tpl = { id: string; name: string; module: string; subject: string; body_html: string; signature_id: string | null; is_default: boolean }
type Ctx = {
  configured: boolean; sender: { address: string; name: string; verified: boolean } | null
  replyTo: string; defaultCc: string[]; signatures: Sig[]; templates: Tpl[]
  docs: { type: string; label: string }[]
  doc: { ref: string; docLabel: string; recipientName: string; recipientEmail: string }
  vars: Record<string, string>; canManage: boolean
}
export type EmailModule = 'sales' | 'purchases' | 'transfers'

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', width: 62, flexShrink: 0 }
const fmtSize = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export default function EmailComposer({ module, id, onClose, onSent }: { module: EmailModule; id: string; onClose: () => void; onSent?: () => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [to, setTo] = useState(''); const [cc, setCc] = useState(''); const [bcc, setBcc] = useState(''); const [showBcc, setShowBcc] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [subject, setSubject] = useState(''); const [bodyHtml, setBodyHtml] = useState(''); const [editorKey, setEditorKey] = useState(0)
  const [sigId, setSigId] = useState(''); const [tplId, setTplId] = useState('')
  const [docs, setDocs] = useState<string[]>([]); const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/org/email/context?module=${module}&id=${id}`)
      const j = await r.json().catch(() => ({ error: 'Could not load' }))
      if (!r.ok) { setLoadErr(j.error ?? 'Could not load'); return }
      const c = j as Ctx
      setCtx(c); setTo(c.doc.recipientEmail); setCc(c.defaultCc.join(', ')); setReplyTo(c.replyTo)
      const dflt = c.signatures.find(s => s.is_default); if (dflt) setSigId(dflt.id)
      const t = c.templates.find(x => x.is_default)
      if (t) applyTemplate(t, c)
      else { setSubject(`${c.doc.docLabel} ${c.doc.ref} from ${c.vars.company_name}`); setBodyHtml(`<p>Hi ${c.doc.recipientName || 'there'},</p><p>Please find ${c.doc.docLabel.toLowerCase()} ${c.doc.ref} attached.</p>`); setEditorKey(k => k + 1) }
      if (c.docs.length) setDocs([c.docs[0].type])
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, id])

  function applyTemplate(t: Tpl, c: Ctx | null = ctx) {
    if (!c) return
    setTplId(t.id)
    setSubject(fillPlaceholders(t.subject, c.vars))
    setBodyHtml(fillPlaceholders(t.body_html, c.vars, true)); setEditorKey(k => k + 1)
    if (t.signature_id && c.signatures.some(s => s.id === t.signature_id)) setSigId(t.signature_id)
  }
  const sig = ctx?.signatures.find(s => s.id === sigId)
  const total = files.reduce((n, f) => n + f.size, 0)

  function addFiles(list: FileList | null) {
    if (!list) return
    const next = [...files, ...Array.from(list)]
    if (next.length > 10) return setErr('Attach 10 files or fewer.')
    if (next.reduce((n, f) => n + f.size, 0) > 12 * 1048576) return setErr('Your own files can total 12 MB at most.')
    setErr(''); setFiles(next)
  }

  async function send() {
    if (!ctx) return
    setSending(true); setErr('')
    const fd = new FormData()
    fd.set('module', module); fd.set('id', id); fd.set('to', to); fd.set('cc', cc); fd.set('bcc', bcc); fd.set('replyTo', replyTo)
    fd.set('subject', subject); fd.set('body_html', bodyHtml); fd.set('signature_id', sigId); fd.set('docs', JSON.stringify(docs))
    files.forEach(f => fd.append('files', f))
    try {
      const r = await fetch('/api/org/email/send', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error ?? 'Could not send the email.'); setSending(false); return }
      setDone(true); onSent?.(); setTimeout(onClose, 1400)
    } catch { setErr('Network problem — the email was not sent.'); setSending(false) }
  }

  const row = (label: string, el: React.ReactNode) => <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={lbl}>{label}</span><div style={{ flex: 1, minWidth: 0 }}>{el}</div></div>

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={e => e.stopPropagation()}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: 720, maxWidth: '100%', maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)' }}>Email {ctx ? `${ctx.doc.docLabel} ${ctx.doc.ref}` : ''}</div>
          <button className="btn btn-outline" style={{ height: 28, fontSize: 12 }} onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: '16px 22px', overflowY: 'auto', display: 'grid', gap: 10 }}>
          {loadErr && <div style={{ color: '#B91C1C', fontSize: 13 }}>{loadErr}</div>}
          {!ctx && !loadErr && <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>Loading…</div>}
          {ctx && !ctx.configured && (
            <div style={{ padding: '9px 14px', borderRadius: 9, fontSize: 13, background: '#FEF3C7', color: '#92400E' }}>
              Email isn’t ready to send yet. {ctx.canManage ? 'Finish the setup in Settings → Email.' : 'Ask an administrator to finish the setup in Settings → Email.'}
            </div>)}
          {ctx && (<>
            {ctx.sender && row('From', <div style={{ fontSize: 13 }}>{ctx.sender.name} &lt;{ctx.sender.address}&gt;</div>)}
            {row('To', <input className="modal-input" value={to} onChange={e => setTo(e.target.value)} placeholder="name@company.com, another@company.com" />)}
            {row('CC', <input className="modal-input" value={cc} onChange={e => setCc(e.target.value)} />)}
            {showBcc ? row('BCC', <input className="modal-input" value={bcc} onChange={e => setBcc(e.target.value)} />) : <div style={{ paddingLeft: 70 }}><a style={{ fontSize: 12, color: 'var(--teal)', cursor: 'pointer' }} onClick={() => setShowBcc(true)}>Add BCC</a></div>}
            {row('Reply-to', <input className="modal-input" value={replyTo} onChange={e => setReplyTo(e.target.value)} />)}
            {row('Template', (
              <select className="modal-input" value={tplId} onChange={e => { const t = ctx.templates.find(x => x.id === e.target.value); if (t) applyTemplate(t); else setTplId('') }}>
                <option value="">— none —</option>{ctx.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>))}
            {row('Subject', <input className="modal-input" value={subject} onChange={e => setSubject(e.target.value)} />)}
            <RichEditor html={bodyHtml} reset={editorKey} onChange={setBodyHtml} minHeight={170} placeholders={PLACEHOLDERS as never} />
            {row('Signature', (
              <select className="modal-input" value={sigId} onChange={e => setSigId(e.target.value)}>
                <option value="">— none —</option>{ctx.signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>))}
            {sig && <div style={{ fontSize: 12.5, color: 'var(--gray-500)', borderLeft: '3px solid var(--gray-200)', paddingLeft: 10 }} dangerouslySetInnerHTML={{ __html: fillPlaceholders(sig.body_html, ctx.vars, true) }} />}
            <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6 }}>Attachments</div>
              {ctx.docs.map(d => (
                <label key={d.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
                  <input type="checkbox" checked={docs.includes(d.type)} onChange={e => setDocs(p => e.target.checked ? [...p, d.type] : p.filter(x => x !== d.type))} />
                  {d.label} <span style={{ color: 'var(--gray-400)' }}>(PDF, made when sent)</span>
                </label>))}
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {f.name}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{fmtSize(f.size)}</span>
                  <a style={{ color: 'var(--danger)', cursor: 'pointer' }} onClick={() => setFiles(p => p.filter((_, j) => j !== i))}>Remove</a>
                </div>))}
              <button className="btn btn-outline" style={{ height: 30, fontSize: 12, marginTop: 6 }} onClick={() => fileRef.current?.click()}>Attach files from your computer</button>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              {total > 0 && <span style={{ fontSize: 11.5, color: 'var(--gray-400)', marginLeft: 8 }}>{fmtSize(total)}</span>}
            </div>
          </>)}
          {err && <div style={{ color: '#B91C1C', fontSize: 13 }}>{err}</div>}
          {done && <div style={{ color: '#047857', fontSize: 13, fontWeight: 600 }}>Email sent ✓</div>}
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-outline" style={{ height: 36 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ height: 36, padding: '0 22px' }} onClick={send} disabled={sending || done || !ctx?.configured}>{sending ? 'Sending…' : 'Send email'}</button>
        </div>
      </div>
    </div>
  )
}
