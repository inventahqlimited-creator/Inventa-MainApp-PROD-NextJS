'use client'
import { useEffect, useState } from 'react'
import RichEditor from './rich-editor'
import { PLACEHOLDERS } from '@/lib/email/render'
import type { EmailSettings } from '@/lib/email/config'

type Sig = { id: string; name: string; body_html: string; is_default: boolean }
type Tpl = { id: string; name: string; module: string; subject: string; body_html: string; signature_id: string | null; is_default: boolean }
type LogRow = { id: string; created_at: string; sent_by_name: string | null; doc_ref: string | null; to_addresses: string[]; subject: string | null; status: string; error: string | null }

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }
const head: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }
const title: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }
const sub: React.CSSProperties = { fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }
const body: React.CSSProperties = { padding: '18px 20px' }

async function api<T>(url: string, method = 'GET', data?: unknown): Promise<T & { error?: string }> {
  const r = await fetch(url, { method, headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined })
  return r.json().catch(() => ({ error: 'Something went wrong' }))
}

export default function EmailSettingsTab() {
  const [s, setS] = useState<EmailSettings | null>(null)
  const [configured, setConfigured] = useState(true)
  const [sender, setSender] = useState<{ address: string; verified: boolean } | null>(null)
  const [cc, setCc] = useState('')
  const [domain, setDomain] = useState('')
  const [sigs, setSigs] = useState<Sig[]>([])
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [log, setLog] = useState<LogRow[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sigEdit, setSigEdit] = useState<(Partial<Sig> & { n: number }) | null>(null)
  const [tplEdit, setTplEdit] = useState<(Partial<Tpl> & { n: number }) | null>(null)

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000) }
  async function load() {
    const [a, b, c, d] = await Promise.all([api<{ settings: EmailSettings; configured: boolean; sender: { address: string; verified: boolean } | null }>('/api/org/email/settings'), api<{ items: Sig[] }>('/api/org/email/signatures'), api<{ items: Tpl[] }>('/api/org/email/templates'), api<{ items: LogRow[] }>('/api/org/email/log')])
    if (a.error) { flash(false, a.error); return }
    setS(a.settings); setConfigured(a.configured); setSender(a.sender); setCc(a.settings.default_cc.join(', ')); setDomain(a.settings.domain)
    setSigs(b.items ?? []); setTpls(c.items ?? []); setLog(d.items ?? [])
  }
  useEffect(() => { load() }, [])
  if (!s) return <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>{msg ? msg.text : 'Loading…'}</div>

  async function saveSender() {
    setBusy(true)
    const r = await api<{ settings: EmailSettings }>('/api/org/email/settings', 'PATCH', { from_name: s!.from_name, from_local: s!.from_local, reply_to: s!.reply_to, default_cc: cc })
    setBusy(false)
    if (r.error) return flash(false, r.error)
    await load(); flash(true, 'Email settings saved.')
  }
  async function domainAction(method: 'POST' | 'PUT' | 'DELETE') {
    setBusy(true)
    const r = await api<{ settings: EmailSettings }>('/api/org/email/domain', method, method === 'POST' ? { domain } : undefined)
    setBusy(false)
    if (r.error) return flash(false, r.error)
    await load()
    flash(true, method === 'PUT' ? (r.settings.domain_status === 'verified' ? 'Domain verified. Emails now send from your own address.' : 'Not verified yet. DNS changes can take a while — try again shortly.') : method === 'DELETE' ? 'Domain removed.' : 'Domain added. Add the DNS records below, then press Check.')
  }
  async function saveSig() {
    if (!sigEdit) return
    const d = { name: sigEdit.name, body_html: sigEdit.body_html ?? '', is_default: !!sigEdit.is_default }
    const r = sigEdit.id ? await api('/api/org/email/signatures/' + sigEdit.id, 'PATCH', d) : await api('/api/org/email/signatures', 'POST', d)
    if (r.error) return flash(false, r.error)
    setSigEdit(null); load()
  }
  async function saveTpl() {
    if (!tplEdit) return
    const d = { name: tplEdit.name, module: tplEdit.module ?? 'any', subject: tplEdit.subject ?? '', body_html: tplEdit.body_html ?? '', signature_id: tplEdit.signature_id ?? null, is_default: !!tplEdit.is_default }
    const r = tplEdit.id ? await api('/api/org/email/templates/' + tplEdit.id, 'PATCH', d) : await api('/api/org/email/templates', 'POST', d)
    if (r.error) return flash(false, r.error)
    setTplEdit(null); load()
  }
  const del = async (kind: 'signatures' | 'templates', id: string) => { if (!confirm('Delete this?')) return; const r = await api(`/api/org/email/${kind}/${id}`, 'DELETE'); if (r.error) flash(false, r.error); else load() }
  const set = (k: keyof EmailSettings, v: string) => setS(p => p ? { ...p, [k]: v } : p)
  const statusColour = s.domain_status === 'verified' ? '#047857' : s.domain_status === 'failed' ? '#B91C1C' : '#92400E'

  return (
    <div style={{ maxWidth: 860 }}>
      {msg && <div style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, fontSize: 13, background: msg.ok ? '#ECFDF5' : '#FEF2F2', color: msg.ok ? '#065F46' : '#991B1B' }}>{msg.text}</div>}
      {!configured && <div style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, fontSize: 13, background: '#FEF3C7', color: '#92400E' }}>Sending email hasn’t been switched on for this platform yet, so emails can’t be sent. Contact InventaHQ support.</div>}

      <div style={card}>
        <div style={head}><div style={title}>Sender</div><div style={sub}>Who your emails come from and where replies go</div></div>
        <div style={{ ...body, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="modal-field"><label className="modal-label">From name</label><input className="modal-input" value={s.from_name} onChange={e => set('from_name', e.target.value)} placeholder="Acme Ltd" /></div>
          <div className="modal-field"><label className="modal-label">Reply-to address</label><input className="modal-input" type="email" value={s.reply_to} onChange={e => set('reply_to', e.target.value)} placeholder="sales@acme.co.nz" /></div>
          <div className="modal-field"><label className="modal-label">Default CC <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(comma separated)</span></label><input className="modal-input" value={cc} onChange={e => setCc(e.target.value)} placeholder="accounts@acme.co.nz" /></div>
          <div className="modal-field"><label className="modal-label">Sending address</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input className="modal-input" style={{ width: 120 }} value={s.from_local} onChange={e => set('from_local', e.target.value)} disabled={s.domain_status !== 'verified'} />
              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>@{s.domain_status === 'verified' ? s.domain : '…'}</span>
            </div>
          </div>
          <div style={{ gridColumn: 'span 2', fontSize: 12.5, color: 'var(--gray-500)' }}>
            {sender ? <>Emails currently send from <b>{sender.address}</b>{sender.verified ? '' : ' (shared InventaHQ address — verify your own domain below so they come from you and avoid spam folders)'}.</> : 'No sending address available yet.'}
          </div>
          <div style={{ gridColumn: 'span 2' }}><button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={saveSender} disabled={busy}>Save</button></div>
        </div>
      </div>

      <div style={card}>
        <div style={head}><div style={title}>Your domain (stops emails landing in spam)</div><div style={sub}>Add the DNS records below at your domain provider so receivers can confirm the email really came from you (SPF + DKIM)</div></div>
        <div style={body}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="modal-input" style={{ maxWidth: 260 }} value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.co.nz" disabled={!!s.domain_id} />
            {!s.domain_id
              ? <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={() => domainAction('POST')} disabled={busy || !domain}>Add domain</button>
              : <>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: statusColour }}>{s.domain_status === 'verified' ? '✓ Verified' : s.domain_status === 'failed' ? 'Failed — check the records' : 'Waiting for DNS'}</span>
                  {s.domain_status !== 'verified' && <button className="btn btn-outline" style={{ height: 32, fontSize: 12.5 }} onClick={() => domainAction('PUT')} disabled={busy}>Check now</button>}
                  <button className="btn btn-outline" style={{ height: 32, fontSize: 12.5 }} onClick={() => { if (confirm('Remove this domain? Emails go back to the shared address.')) domainAction('DELETE') }} disabled={busy}>Remove</button>
                </>}
          </div>
          {s.domain_id && s.domain_records.length > 0 && s.domain_status !== 'verified' && (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--gray-500)' }}><th style={{ padding: 6 }}>Type</th><th style={{ padding: 6 }}>Name / Host</th><th style={{ padding: 6 }}>Value</th><th style={{ padding: 6 }}>Priority</th></tr></thead>
                <tbody>{s.domain_records.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{r.type}</td>
                    <td style={{ padding: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.name}</td>
                    <td style={{ padding: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.value}</td>
                    <td style={{ padding: 6 }}>{r.priority ?? ''}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ ...head, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={title}>Signatures</div><div style={sub}>Added to the bottom of every email</div></div>
          <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={() => setSigEdit({ n: Date.now(), name: '', body_html: '' })}>New signature</button>
        </div>
        <div style={body}>
          {sigs.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>No signatures yet.</div>}
          {sigs.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--gray-100)' }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{g.name}{g.is_default && <span style={{ marginLeft: 8, fontSize: 11, color: '#0D9488' }}>Default</span>}</div>
              <button className="btn btn-outline" style={{ height: 28, fontSize: 12 }} onClick={() => setSigEdit({ ...g, n: Date.now() })}>Edit</button>
              <button className="btn btn-outline" style={{ height: 28, fontSize: 12 }} onClick={() => del('signatures', g.id)}>Delete</button>
            </div>))}
          {sigEdit && (
            <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--gray-200)', borderRadius: 10, display: 'grid', gap: 10 }}>
              <input className="modal-input" placeholder="Signature name (e.g. Sales team)" value={sigEdit.name ?? ''} onChange={e => setSigEdit({ ...sigEdit, name: e.target.value })} />
              <RichEditor html={sigEdit.body_html ?? ''} reset={sigEdit.n} onChange={h => setSigEdit(p => p ? { ...p, body_html: h } : p)} placeholders={PLACEHOLDERS as never} />
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!sigEdit.is_default} onChange={e => setSigEdit({ ...sigEdit, is_default: e.target.checked })} /> Use by default</label>
              <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={saveSig}>Save signature</button><button className="btn btn-outline" style={{ height: 32, fontSize: 12.5 }} onClick={() => setSigEdit(null)}>Cancel</button></div>
            </div>)}
        </div>
      </div>

      <div style={card}>
        <div style={{ ...head, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={title}>Templates</div><div style={sub}>Ready-made subjects and messages to pick when sending. Fields like {'{{customer_name}}'} fill in automatically</div></div>
          <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={() => setTplEdit({ n: Date.now(), name: '', module: 'any', subject: '', body_html: '' })}>New template</button>
        </div>
        <div style={body}>
          {tpls.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>No templates yet.</div>}
          {tpls.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--gray-100)' }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t.name}<span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)', textTransform: 'capitalize' }}>{t.module === 'any' ? 'All modules' : t.module}</span>{t.is_default && <span style={{ marginLeft: 8, fontSize: 11, color: '#0D9488' }}>Default</span>}</div>
              <button className="btn btn-outline" style={{ height: 28, fontSize: 12 }} onClick={() => setTplEdit({ ...t, n: Date.now() })}>Edit</button>
              <button className="btn btn-outline" style={{ height: 28, fontSize: 12 }} onClick={() => del('templates', t.id)}>Delete</button>
            </div>))}
          {tplEdit && (
            <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--gray-200)', borderRadius: 10, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
                <input className="modal-input" placeholder="Template name (e.g. Invoice reminder)" value={tplEdit.name ?? ''} onChange={e => setTplEdit({ ...tplEdit, name: e.target.value })} />
                <select className="modal-input" value={tplEdit.module ?? 'any'} onChange={e => setTplEdit({ ...tplEdit, module: e.target.value })}>
                  <option value="any">All modules</option><option value="sales">Sales</option><option value="purchases">Purchases</option><option value="transfers">Transfers</option>
                </select>
              </div>
              <input className="modal-input" placeholder="Subject, e.g. {{doc_type}} {{doc_number}} from {{company_name}}" value={tplEdit.subject ?? ''} onChange={e => setTplEdit({ ...tplEdit, subject: e.target.value })} />
              <RichEditor html={tplEdit.body_html ?? ''} reset={tplEdit.n} onChange={h => setTplEdit(p => p ? { ...p, body_html: h } : p)} placeholders={PLACEHOLDERS as never} minHeight={160} />
              <select className="modal-input" value={tplEdit.signature_id ?? ''} onChange={e => setTplEdit({ ...tplEdit, signature_id: e.target.value || null })}>
                <option value="">Default signature</option>{sigs.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!tplEdit.is_default} onChange={e => setTplEdit({ ...tplEdit, is_default: e.target.checked })} /> Pre-select when sending</label>
              <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={saveTpl}>Save template</button><button className="btn btn-outline" style={{ height: 32, fontSize: 12.5 }} onClick={() => setTplEdit(null)}>Cancel</button></div>
            </div>)}
        </div>
      </div>

      <div style={card}>
        <div style={head}><div style={title}>Recently sent</div><div style={sub}>The last 50 emails sent from orders</div></div>
        <div style={{ ...body, overflowX: 'auto' }}>
          {log.length === 0 ? <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Nothing sent yet.</div> : (
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <tbody>{log.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ padding: 6 }}>{l.doc_ref}</td>
                  <td style={{ padding: 6 }}>{l.to_addresses.join(', ')}</td>
                  <td style={{ padding: 6 }}>{l.subject}</td>
                  <td style={{ padding: 6, color: l.status === 'sent' ? '#047857' : '#B91C1C' }} title={l.error ?? ''}>{l.status === 'sent' ? 'Sent' : 'Failed'}</td>
                  <td style={{ padding: 6, color: 'var(--gray-400)' }}>{l.sent_by_name}</td>
                </tr>))}</tbody>
            </table>)}
        </div>
      </div>
    </div>
  )
}
