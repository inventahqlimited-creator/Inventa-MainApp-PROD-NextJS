'use client'
// src/components/app/roles-modal.tsx
// Settings → Users → Roles & Permissions. Four fixed roles (Administrator, Manager, Staff, Read Only — shown, not editable)
// and the organisation's own custom roles, which are ticked from the full permission list.
import { useEffect, useMemo, useState } from 'react'
import {
  FIXED_ROLES, FIXED_ROLE_PERMS, GROUPS, ROLE_BLURBS, ROLE_LABELS, ROLE_TEMPLATES,
  closeSet, emptySet, needsOf, toggle, type FixedRole, type PermKey, type PermissionSet,
} from '@/lib/permissions'

type CustomRole = { id: string; name: string; permissions: PermissionSet }
type Selected = { kind: 'fixed'; role: FixedRole } | { kind: 'custom'; id: string } | { kind: 'new' }

const labelOf = (k: PermKey) => GROUPS.flatMap(g => g.perms).find(p => p.key === k)?.label ?? k

const lockIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
)

function PermGroups({ perms, onChange, disabled }: { perms: PermissionSet; onChange: (p: PermissionSet) => void; disabled?: boolean }) {
  return (
    <>
      {GROUPS.map(g => {
        const keys = g.perms.map(p => p.key as PermKey)
        const on = keys.filter(k => perms[k]).length
        const all = on === keys.length
        return (
          <div key={g.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--gray-50)', borderRadius: '8px 8px 0 0', border: '1px solid var(--gray-200)', borderBottom: 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {g.title} <span style={{ fontWeight: 500, color: 'var(--gray-400)', textTransform: 'none', letterSpacing: 0 }}>· {on} of {keys.length}</span>
              </span>
              {!disabled && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={all} style={{ accentColor: 'var(--indigo)', cursor: 'pointer' }}
                    onChange={e => onChange(keys.reduce((acc, k) => toggle(acc, k, e.target.checked), perms))} />
                  Select all
                </label>
              )}
            </div>
            <div style={{ border: '1px solid var(--gray-200)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {g.perms.map((p, i) => {
                const k = p.key as PermKey
                const needs = needsOf(k).filter(n => !perms[n])
                return (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < g.perms.length - 1 ? '1px solid var(--gray-100)' : 'none', background: 'var(--white)', cursor: disabled ? 'default' : 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={perms[k]} disabled={disabled} style={{ accentColor: 'var(--indigo)', flexShrink: 0 }}
                      onChange={e => onChange(toggle(perms, k, e.target.checked))} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: 'var(--slate)' }}>{p.label}</div>
                      {p.hint && <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 1 }}>{p.hint}</div>}
                    </div>
                    {!disabled && !perms[k] && needs.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', textAlign: 'right' }}>Also ticks {needs.map(labelOf).join(', ')}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default function RolesModal({ onClose }: { orgId?: string; onClose: () => void }) {
  const [roles, setRoles] = useState<CustomRole[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Selected>({ kind: 'fixed', role: 'admin' })
  const [draft, setDraft] = useState<PermissionSet>(emptySet())
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('blank')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/org/roles').then(r => r.json())
      .then((data: { id: string; name: string; permissions: Record<string, unknown> }[]) => {
        setRoles((Array.isArray(data) ? data : []).map(r => ({ id: r.id, name: r.name, permissions: closeSet(r.permissions) })))
      })
      .catch(() => setError('Could not load roles.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const current = useMemo(() => (sel.kind === 'custom' ? roles.find(r => r.id === sel.id) ?? null : null), [sel, roles])

  function pick(next: Selected) {
    setSel(next); setError(null); setNotice(null)
    if (next.kind === 'custom') setDraft(roles.find(r => r.id === next.id)?.permissions ?? emptySet())
    if (next.kind === 'new') { setName(''); setTemplate('blank'); setDraft(emptySet()) }
  }

  const post = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  async function create() {
    const n = name.trim()
    if (!n) { setError('Give the role a name.'); return }
    if (roles.some(r => r.name.toLowerCase() === n.toLowerCase()) || FIXED_ROLES.some(f => ROLE_LABELS[f].toLowerCase() === n.toLowerCase())) { setError('A role with this name already exists.'); return }
    setSaving(true); setError(null)
    const { ok, data } = await post('/api/org/roles', 'POST', { name: n, permissions: draft })
    setSaving(false)
    if (!ok) { setError(data.error ?? 'Could not create the role.'); return }
    const created: CustomRole = { id: data.id, name: data.name, permissions: closeSet(data.permissions) }
    setRoles(prev => [...prev, created])
    setSel({ kind: 'custom', id: created.id }); setDraft(created.permissions); setNotice('Role created. You can give it to a user from Users.')
  }

  async function save() {
    if (!current) return
    setSaving(true); setError(null)
    const { ok, data } = await post(`/api/org/roles/${current.id}`, 'PATCH', { permissions: draft })
    setSaving(false)
    if (!ok) { setError(data.error ?? 'Could not save the role.'); return }
    setRoles(prev => prev.map(r => (r.id === current.id ? { ...r, permissions: closeSet(draft) } : r)))
    setNotice('Saved. People with this role get the change the next time they open a page.')
  }

  async function remove(r: CustomRole) {
    if (!window.confirm(`Delete the role “${r.name}”?`)) return
    const { ok, data } = await post(`/api/org/roles/${r.id}`, 'DELETE')
    if (!ok) { setError(data.error ?? 'Could not delete the role.'); return }
    setRoles(prev => prev.filter(x => x.id !== r.id))
    if (sel.kind === 'custom' && sel.id === r.id) pick({ kind: 'fixed', role: 'admin' })
  }

  const dirty = current ? JSON.stringify(closeSet(draft)) !== JSON.stringify(current.permissions) : false
  const rowStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', cursor: 'pointer', background: active ? '#EEF2FF' : 'transparent',
    borderLeft: active ? '3px solid var(--indigo)' : '3px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onMouseDown={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: '100%', maxWidth: 900, height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)' }}>Roles &amp; Permissions</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Choose what each role can see and do</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 230, borderRight: '1px solid var(--gray-100)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '12px 16px 6px', fontSize: 11.5, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Standard roles</div>
              {FIXED_ROLES.map(f => (
                <div key={f} style={rowStyle(sel.kind === 'fixed' && sel.role === f)} onClick={() => pick({ kind: 'fixed', role: f })}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)' }}>{ROLE_LABELS[f]}</span>{lockIcon}
                </div>
              ))}
              <div style={{ padding: '16px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your roles</span>
                <button onClick={() => pick({ kind: 'new' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--indigo)', fontSize: 12, fontWeight: 600 }}>+ New</button>
              </div>
              {loading && <div style={{ padding: 16, fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}
              {!loading && roles.length === 0 && <div style={{ padding: '4px 16px 16px', fontSize: 12.5, color: 'var(--gray-400)', lineHeight: 1.5 }}>No roles of your own yet. Click New to make one, such as Warehouse or Accounts.</div>}
              {roles.map(r => (
                <div key={r.id} style={rowStyle(sel.kind === 'custom' && sel.id === r.id)} onClick={() => pick({ kind: 'custom', id: r.id })}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', overflowWrap: 'anywhere' }}>{r.name}</span>
                  <button onClick={e => { e.stopPropagation(); void remove(r) }} title="Delete role" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', padding: 2 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 24, minWidth: 0 }}>
            {error && <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 13, color: '#B91C1C', marginBottom: 16 }}>{error}</div>}
            {notice && <div style={{ padding: '10px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 13, color: '#047857', marginBottom: 16 }}>{notice}</div>}

            {sel.kind === 'fixed' && (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>{ROLE_LABELS[sel.role]}</div>
                <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, fontSize: 13, color: '#92400E', marginBottom: 20, lineHeight: 1.5 }}>
                  {ROLE_BLURBS[sel.role]} {sel.role !== 'admin' && 'Standard roles can’t be edited. To change what someone can do, make your own role.'}
                </div>
                <PermGroups perms={FIXED_ROLE_PERMS[sel.role]} onChange={() => {}} disabled />
              </>
            )}

            {sel.kind === 'new' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Role name</label>
                    <input className="modal-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Warehouse" autoFocus />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Start from</label>
                    <select className="modal-input" value={template} onChange={e => { setTemplate(e.target.value); setDraft(ROLE_TEMPLATES.find(t => t.id === e.target.value)?.perms ?? emptySet()) }}>
                      {ROLE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name} — {t.blurb}</option>)}
                    </select>
                  </div>
                </div>
                <PermGroups perms={draft} onChange={setDraft} />
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-primary" style={{ height: 34, fontSize: 13 }} onClick={() => void create()} disabled={saving}>{saving ? 'Creating…' : 'Create role'}</button>
                  <button className="btn" style={{ height: 34, fontSize: 13 }} onClick={() => pick({ kind: 'fixed', role: 'admin' })}>Cancel</button>
                </div>
              </>
            )}

            {sel.kind === 'custom' && current && (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', marginBottom: 16 }}>{current.name}</div>
                <PermGroups perms={draft} onChange={p => { setDraft(p); setNotice(null) }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-primary" style={{ height: 34, fontSize: 13 }} onClick={() => void save()} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
                  <button className="btn" style={{ height: 34, fontSize: 13 }} onClick={() => pick({ kind: 'custom', id: current.id })} disabled={!dirty}>Undo changes</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

