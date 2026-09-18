'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Org = Record<string, unknown>
type Location = {
  id: string
  name: string
  type: string
  address: string | null
  phone: string | null
  email: string | null
  active: boolean
  bins?: Bin[]
}
type Bin = { id: string; name: string; description: string | null }
type TaxRate = { id: string; name: string; code: string; rate: number; is_default: boolean }
type Currency = { id: string; code: string; name: string; rate: number; symbol: string | null }
type Uom = { id: string; name: string; abbr: string; in_use?: boolean }
type PriceLevel = { id: string; name: string; is_default: boolean }

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'products', label: 'Products' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'transfers', label: 'Transfers' },
  { key: 'sales', label: 'Sales' },
  { key: 'users', label: 'Users' },
  { key: 'security', label: 'Security' },
  { key: 'integrations', label: 'Integrations' },
] as const
type Tab = typeof TABS[number]['key']

// ── Shared UI primitives ──────────────────────────────────────────────

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)', letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({ label, sub, active, onChange }: { label: string; sub: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{sub}</div>
      </div>
      <button className="status-toggle" data-active={String(active)} onClick={() => onChange(!active)} type="button">
        <div className="status-toggle-knob" />
      </button>
    </div>
  )
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className="modal-field" style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <label className="modal-label">{label}</label>
      {children}
    </div>
  )
}

function MInput({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean
}) {
  return (
    <input
      className="modal-input"
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ background: disabled ? 'var(--gray-50)' : 'var(--white)', opacity: disabled ? 0.7 : 1 }}
    />
  )
}

function Select({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <select
      className="modal-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{ background: disabled ? 'var(--gray-50)' : 'var(--white)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1 }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function SaveBtn({ onClick, saving }: { onClick: () => void; saving?: boolean }) {
  return (
    <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={onClick} disabled={saving}>
      {saving ? 'Saving…' : 'Save'}
    </button>
  )
}

function LockBadge({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px', marginLeft: 8 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      {label}
    </span>
  )
}

// ── Bins Modal ────────────────────────────────────────────────────────

function BinsModal({ location, orgId, onClose, onUpdate }: {
  location: Location
  orgId: string
  onClose: () => void
  onUpdate: (locationId: string, bins: Bin[]) => void
}) {
  const [bins, setBins] = useState<Bin[]>(location.bins ?? [])
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function addBin() {
    if (!newName.trim()) { setError('Bin name is required'); return }
    setAdding(true); setError(null)
    const res = await fetch('/api/org/bins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: location.id, name: newName.trim(), description: newDesc.trim() || null }),
    })
    const data = await res.json()
    setAdding(false)
    if (res.ok) {
      const updated = [...bins, { id: data.id, name: newName.trim(), description: newDesc.trim() || null }]
      setBins(updated)
      onUpdate(location.id, updated)
      setNewName(''); setNewDesc('')
    } else setError(data.error ?? 'Failed to add bin')
  }

  async function deleteBin(id: string) {
    await fetch(`/api/org/bins/${id}`, { method: 'DELETE' })
    const updated = bins.filter(b => b.id !== id)
    setBins(updated)
    onUpdate(location.id, updated)
  }

  async function renameBin(id: string, name: string) {
    await fetch(`/api/org/bins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const updated = bins.map(b => b.id === id ? { ...b, name } : b)
    setBins(updated)
    onUpdate(location.id, updated)
  }

  async function importBulk() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    setImporting(true)
    const results: Bin[] = []
    for (const line of lines) {
      const [name, description] = line.split(',').map(s => s.trim())
      if (!name) continue
      const res = await fetch('/api/org/bins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: location.id, name, description: description || null }),
      })
      if (res.ok) { const d = await res.json(); results.push({ id: d.id, name, description: description || null }) }
    }
    const updated = [...bins, ...results]
    setBins(updated)
    onUpdate(location.id, updated)
    setImporting(false)
    setBulkMode(false)
    setBulkText('')
  }

  function downloadSample() {
    const csv = 'Bin Name,Description\nBin A1,Top shelf row A\nBin B2,Cold storage\nBin C3,\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bins-sample.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const lines = text.split('\n').slice(1) // skip header
      setBulkText(lines.join('\n'))
      setBulkMode(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--gray-100)' }}>
          <div>
            <div className="modal-title">Manage Bins — {location.name}</div>
            <div className="modal-subtitle">Add storage bins to this location</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 16 }}>
            <button className="btn btn-outline" style={{ height: 30, fontSize: 11.5, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }} onClick={downloadSample}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Sample CSV
            </button>
            <button className="btn btn-outline" style={{ height: 30, fontSize: 11.5, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }} onClick={() => fileRef.current?.click()}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvUpload} />
            <button className="modal-close" onClick={onClose} style={{ marginLeft: 4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: 480, overflowY: 'auto' }}>

          {/* Add single bin */}
          {!bulkMode && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 16, padding: '4px 0' }}>
              <div className="modal-field">
                <label className="modal-label">Bin Name <span className="req">*</span></label>
                <MInput value={newName} onChange={setNewName} placeholder="e.g. A1, Row B, Cold Store" />
              </div>
              <div className="modal-field">
                <label className="modal-label">Description</label>
                <MInput value={newDesc} onChange={setNewDesc} placeholder="Optional description" />
              </div>
              <button className="btn btn-primary" style={{ height: 36 }} onClick={addBin} disabled={adding}>
                {adding ? '…' : 'Add'}
              </button>
            </div>
          )}

          {/* Bulk import preview */}
          {bulkMode && (
            <div style={{ marginBottom: 16, background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', marginBottom: 8 }}>Bulk Import — paste CSV rows (Name, Description) or edit the imported file below:</div>
              <textarea
                className="modal-input"
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={6}
                placeholder={'Bin A1, Top shelf\nBin B2, Cold storage\nBin C3'}
                style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" style={{ height: 32, fontSize: 12 }} onClick={importBulk} disabled={importing}>
                  {importing ? 'Importing…' : 'Import All'}
                </button>
                <button className="btn btn-outline" style={{ height: 32, fontSize: 12 }} onClick={() => { setBulkMode(false); setBulkText('') }}>Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>{error}</div>
          )}

          {/* Bins list */}
          {bins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)', fontSize: 13, background: 'var(--gray-50)', borderRadius: 10 }}>
              No bins yet. Add one above or import a CSV.
            </div>
          ) : (
            <div style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th className="li-th">Bin Name</th>
                    <th className="li-th">Description</th>
                    <th className="li-th" style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {bins.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td" style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>
                        <InlineEditable value={b.name} onChange={name => renameBin(b.id, name)} />
                      </td>
                      <td className="li-td" style={{ color: 'var(--gray-400)', fontSize: 12.5 }}>{b.description ?? '—'}</td>
                      <td className="li-td">
                        <button onClick={() => deleteBin(b.id)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Location Modal ───────────────────────────────────────────────

function EditLocationModal({ location, onClose, onSave }: {
  location: Location
  onClose: () => void
  onSave: (updated: Location) => void
}) {
  const [name, setName] = useState(location.name)
  const [type, setType] = useState(location.type)
  const [address, setAddress] = useState(location.address ?? '')
  const [phone, setPhone] = useState(location.phone ?? '')
  const [email, setEmail] = useState(location.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) { setError('Location name is required'); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/org/locations/${location.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type, address: address.trim() || null, phone: phone.trim() || null, email: email.trim() || null }),
    })
    setSaving(false)
    if (res.ok) {
      onSave({ ...location, name: name.trim(), type, address: address.trim() || null, phone: phone.trim() || null, email: email.trim() || null })
      onClose()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit Location</div>
            <div className="modal-subtitle">{location.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Location Name <span className="req">*</span></label>
              <MInput value={name} onChange={setName} placeholder="e.g. Auckland Warehouse" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Type</label>
              <Select value={type} onChange={setType} options={['Warehouse','Store','Supplier','Virtual'].map(t => ({ value: t, label: t }))} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Phone</label>
              <MInput value={phone} onChange={setPhone} placeholder="+64 9 000 0000" />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Address</label>
              <MInput value={address} onChange={setAddress} placeholder="123 Main St, Auckland 1010" />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Email</label>
              <MInput value={email} onChange={setEmail} placeholder="warehouse@business.com" type="email" />
            </div>
          </div>
          {error && <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#B91C1C', marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Location Modal ─────────────────────────────────────────────────

function AddLocationModal({ orgId, onClose, onAdd }: {
  orgId: string
  onClose: () => void
  onAdd: (loc: Location) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('Warehouse')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) { setError('Location name is required'); return }
    setSaving(true); setError(null)
    const res = await fetch('/api/org/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type, address: address.trim() || null, phone: phone.trim() || null, email: email.trim() || null, active: true }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      onAdd({ id: data.id, name: name.trim(), type, address: address.trim() || null, phone: phone.trim() || null, email: email.trim() || null, active: true, bins: [] })
      onClose()
    } else setError(data.error ?? 'Failed to add location')
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Add Location</div>
            <div className="modal-subtitle">Warehouse, store or other stock location</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Location Name <span className="req">*</span></label>
              <MInput value={name} onChange={setName} placeholder="e.g. Auckland Warehouse" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Type</label>
              <Select value={type} onChange={setType} options={['Warehouse','Store','Supplier','Virtual'].map(t => ({ value: t, label: t }))} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Phone</label>
              <MInput value={phone} onChange={setPhone} placeholder="+64 9 000 0000" />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Address</label>
              <MInput value={address} onChange={setAddress} placeholder="123 Main St, Auckland 1010" />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label className="modal-label">Email</label>
              <MInput value={email} onChange={setEmail} placeholder="warehouse@business.com" type="email" />
            </div>
          </div>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#B91C1C', marginTop: 12 }}>{error}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add Location'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Contacts Tab ─────────────────────────────────────────────────────

type CustomField = { id: string; name: string; field_type: 'text' | 'number' | 'date' }
type CustomListOption = { id: string; value: string }
type CustomList = { id: string; name: string; options: CustomListOption[] }

function InlineEditable({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onChange(trimmed)
    else setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        autoFocus
        style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)', border: 'none', borderBottom: '2px solid var(--teal)', outline: 'none', background: 'transparent', padding: '0 2px', width: Math.max(120, draft.length * 9), ...style }}
      />
    )
  }
  return (
    <span
      onDoubleClick={() => { setDraft(value); setEditing(true) }}
      title="Double-click to rename"
      style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)', cursor: 'text', borderBottom: '1px dashed transparent', ...style }}
      onMouseOver={e => (e.currentTarget.style.borderBottomColor = 'var(--gray-300)')}
      onMouseOut={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
    >
      {value}
    </span>
  )
}

function ContactsTab({ taxRates, currencies, locations, priceLevels, orgId, showToast }: {
  taxRates: TaxRate[]
  currencies: Currency[]
  locations: Location[]
  priceLevels: PriceLevel[]
  orgId: string
  showToast: (type: 'success' | 'error', msg: string) => void
}) {
  const [defTaxRate, setDefTaxRate] = useState('')
  const [defCurrency, setDefCurrency] = useState('')
  const [defLocation, setDefLocation] = useState('')
  const [defPaymentTerms, setDefPaymentTerms] = useState('Net 30')
  const [defPriceTier, setDefPriceTier] = useState('')
  const [saving, setSaving] = useState(false)

  // Custom Fields — loaded from DB
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [fieldsLoaded, setFieldsLoaded] = useState(false)

  // Custom Lists — loaded from DB
  const [customLists, setCustomLists] = useState<CustomList[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  const [expandedList, setExpandedList] = useState<string | null>(null)
  const [newOptionText, setNewOptionText] = useState<Record<string, string>>({})

  // Load on mount
  useEffect(() => {
    fetch('/api/org/contact-custom-fields').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCustomFields(data)
      setFieldsLoaded(true)
    })
    fetch('/api/org/contact-custom-lists').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCustomLists(data)
      setListsLoaded(true)
    })
  }, [])

  // Custom Fields actions — each immediately persists
  async function addField() {
    const name = `Custom Field ${customFields.length + 1}`
    const res = await fetch('/api/org/contact-custom-fields', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, field_type: 'text' }),
    })
    const data = await res.json()
    if (res.ok) setCustomFields(prev => [...prev, { id: data.id, name: data.name, field_type: data.field_type }])
    else showToast('error', data.error ?? 'Failed to add field')
  }

  async function renameField(id: string, name: string) {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, name } : f))
    await fetch(`/api/org/contact-custom-fields/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  async function setFieldType(id: string, field_type: CustomField['field_type']) {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, field_type } : f))
    await fetch(`/api/org/contact-custom-fields/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_type }),
    })
  }

  async function deleteField(id: string) {
    setCustomFields(prev => prev.filter(f => f.id !== id))
    await fetch(`/api/org/contact-custom-fields/${id}`, { method: 'DELETE' })
  }

  // Custom Lists actions
  async function addList() {
    const name = `Custom List ${customLists.length + 1}`
    const res = await fetch('/api/org/contact-custom-lists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (res.ok) {
      setCustomLists(prev => [...prev, { id: data.id, name: data.name, options: [] }])
      setExpandedList(data.id)
    } else showToast('error', data.error ?? 'Failed to add list')
  }

  async function renameList(id: string, name: string) {
    setCustomLists(prev => prev.map(l => l.id === id ? { ...l, name } : l))
    await fetch(`/api/org/contact-custom-lists/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  async function deleteList(id: string) {
    setCustomLists(prev => prev.filter(l => l.id !== id))
    if (expandedList === id) setExpandedList(null)
    await fetch(`/api/org/contact-custom-lists/${id}`, { method: 'DELETE' })
  }

  async function addOption(listId: string) {
    const text = (newOptionText[listId] ?? '').trim()
    if (!text) return
    const res = await fetch(`/api/org/contact-custom-lists/${listId}/options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: text }),
    })
    const data = await res.json()
    if (res.ok) {
      setCustomLists(prev => prev.map(l => l.id === listId ? { ...l, options: [...l.options, { id: data.id, value: text }] } : l))
      setNewOptionText(prev => ({ ...prev, [listId]: '' }))
    }
  }

  async function deleteOption(listId: string, optionId: string) {
    setCustomLists(prev => prev.map(l => l.id === listId ? { ...l, options: l.options.filter(o => o.id !== optionId) } : l))
    await fetch(`/api/org/contact-custom-lists/${listId}/options`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_id: optionId }),
    })
  }

  async function renameOption(listId: string, optionId: string, value: string) {
    setCustomLists(prev => prev.map(l => l.id === listId ? { ...l, options: l.options.map(o => o.id === optionId ? { ...o, value } : o) } : l))
    await fetch(`/api/org/contact-custom-lists/${listId}/options`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_id: optionId, value }),
    })
  }

  const taxOptions = [
    { value: '', label: '— None —' },
    ...taxRates.map(t => ({ value: t.id, label: `${t.code} — ${t.name} (${t.rate}%)` }))
  ]
  const currencyOptions = [
    { value: '', label: '— None —' },
    ...currencies.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
  ]
  const locationOptions = [
    { value: '', label: '— None —' },
    ...locations.filter(l => l.active).map(l => ({ value: l.id, label: l.name }))
  ]

  async function save() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 300))
    setSaving(false)
    showToast('success', 'Contact defaults saved')
  }

  return (
    <>
      <Card title="Default Contact Settings" subtitle="Pre-filled values when adding a new contact" action={<SaveBtn onClick={save} saving={saving} />}>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Default Tax Rate">
            <Select value={defTaxRate} onChange={setDefTaxRate} options={taxOptions} />
          </Field>
          <Field label="Default Currency">
            <Select value={defCurrency} onChange={setDefCurrency} options={currencyOptions} />
          </Field>
          <Field label="Default Location">
            <Select value={defLocation} onChange={setDefLocation} options={locationOptions} />
          </Field>
          <Field label="Default Payment Terms">
            <Select value={defPaymentTerms} onChange={setDefPaymentTerms} options={['Net 7','Net 14','Net 30','Net 60','COD','Prepaid'].map(t => ({ value: t, label: t }))} />
          </Field>
          <Field label="Default Price Tier">
            <Select value={defPriceTier} onChange={setDefPriceTier} options={[{ value: '', label: '— None —' }, ...priceLevels.map(pl => ({ value: pl.id, label: pl.name }))]} />
          </Field>
        </div>
      </Card>

      {/* Custom Fields + Custom Lists side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Custom Fields */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>Custom Fields</div>
              <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Text, number or date fields for contacts</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addField}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Field
            </button>
            </div>
          </div>
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
            {customFields.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-300)', fontSize: 12.5 }}>No custom fields yet.</div>
            )}
            {customFields.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="2" style={{ flexShrink: 0 }}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                <InlineEditable value={f.name} onChange={name => renameField(f.id, name)} />
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  {(['text','number','date'] as const).map(t => (
                    <button key={t} onClick={() => setFieldType(f.id, t)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1.5px solid ${f.field_type === t ? 'var(--teal)' : 'var(--gray-200)'}`, background: f.field_type === t ? 'var(--teal-surface)' : 'var(--white)', color: f.field_type === t ? 'var(--teal)' : 'var(--gray-400)', cursor: 'pointer', fontWeight: f.field_type === t ? 700 : 400 }}>{t}</button>
                  ))}
                </div>
                <button onClick={() => deleteField(f.id)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-300)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-300)')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Lists */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-100)', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--slate)' }}>Custom Lists</div>
              <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Dropdown lists for contacts</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addList}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add List
              </button>
            </div>
          </div>
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
            {customLists.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-300)', fontSize: 12.5 }}>No custom lists yet.</div>
            )}
            {customLists.map(l => (
              <div key={l.id} style={{ border: '1.5px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--gray-50)' }}>
                  <button onClick={() => setExpandedList(expandedList === l.id ? null : l.id)}
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--gray-200)', background: 'var(--white)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--gray-400)', transition: 'transform 0.15s' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: expandedList === l.id ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div>
                    <InlineEditable value={l.name} onChange={name => renameList(l.id, name)} />
                    <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 1 }}>{l.options.length} {l.options.length === 1 ? 'option' : 'options'}</div>
                  </div>
                  <button onClick={() => deleteList(l.id)} style={{ marginLeft: 'auto', width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-300)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-300)')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </div>
                {expandedList === l.id && (
                  <div style={{ padding: '8px 12px 10px', background: 'var(--white)', borderTop: '1px solid var(--gray-100)' }}>
                    {l.options.map(opt => (
                      <div key={opt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 7, marginBottom: 3 }}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                        <InlineEditable value={opt.value} onChange={v => renameOption(l.id, opt.id, v)} style={{ fontSize: 13 }} />
                        <button onClick={() => deleteOption(l.id, opt.id)} style={{ width: 20, height: 20, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-300)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-300)')}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '2px 4px' }}>
                      <input
                        className="modal-input"
                        value={newOptionText[l.id] ?? ''}
                        onChange={e => setNewOptionText(prev => ({ ...prev, [l.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addOption(l.id) }}
                        placeholder="+ Add option"
                        style={{ fontSize: 12.5, height: 30, border: '1.5px dashed var(--gray-200)', background: 'transparent' }}
                      />
                      {(newOptionText[l.id] ?? '').trim() && (
                        <button className="btn btn-primary" style={{ height: 30, fontSize: 12, padding: '0 10px' }} onClick={() => addOption(l.id)}>Add</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export default function SettingsClient({
  org,
  locations: initialLocations,
  taxRates: initialTaxRates,
  currencies: initialCurrencies,
  orgId,
  isAdmin,
  initialTab,
  hasTxns = false,
}: {
  org: Org
  locations: Location[]
  taxRates: TaxRate[]
  currencies: Currency[]
  orgId: string
  isAdmin: boolean
  initialTab: string
  hasTxns?: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'general')

  // Org details
  const [bizName, setBizName] = useState(String(org.name ?? ''))
  const [bizEmail, setBizEmail] = useState(String(org.email ?? ''))
  const [bizPhone, setBizPhone] = useState(String(org.phone ?? ''))
  const [bizAddress, setBizAddress] = useState(String(org.address ?? ''))
  const [website, setWebsite] = useState(String(org.website ?? ''))
  const [abn, setAbn] = useState(String(org.abn_nzbn ?? ''))
  const [gstNumber, setGstNumber] = useState(String(org.gst_number ?? ''))
  const [country, setCountry] = useState(String(org.country ?? 'New Zealand'))
  const [baseCurrency, setBaseCurrency] = useState(String(org.base_currency ?? 'NZD'))
  const [timezone, setTimezone] = useState(String(org.timezone ?? 'Pacific/Auckland'))
  const [dateFormat, setDateFormat] = useState(String(org.date_format ?? 'DD/MM/YYYY'))
  const [decimalPlaces, setDecimalPlaces] = useState(String(org.decimal_places ?? '2'))
  const [logoUrl, setLogoUrl] = useState(String(org.logo_url ?? ''))
  const [logoPreview, setLogoPreview] = useState(String(org.logo_url ?? ''))
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [savingOrg, setSavingOrg] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  // Currency lock — locked once any transaction exists
  const currencyLocked = hasTxns

  // Locations
  const [locations, setLocations] = useState<Location[]>(initialLocations.map(l => ({ ...l, bins: (l as Location).bins ?? [] })))
  const [showAddLoc, setShowAddLoc] = useState(false)
  const [editLocModal, setEditLocModal] = useState<Location | null>(null)
  const [binsModal, setBinsModal] = useState<Location | null>(null)

  // Tax Rates
  const [taxRates, setTaxRates] = useState(initialTaxRates)
  const [newTaxName, setNewTaxName] = useState('')
  const [newTaxCode, setNewTaxCode] = useState('')
  const [newTaxRate, setNewTaxRate] = useState('')
  const [addingTax, setAddingTax] = useState(false)

  // Currencies
  const [currencies, setCurrencies] = useState(initialCurrencies)
  const [newCurrCode, setNewCurrCode] = useState('')
  const [newCurrName, setNewCurrName] = useState('')
  const [newCurrRate, setNewCurrRate] = useState('')

  // Products settings
  const [serialTracking, setSerialTracking] = useState(Boolean(org.serial_tracking))
  const [batchTracking, setBatchTracking] = useState(Boolean(org.batch_tracking))
  const [expiryTracking, setExpiryTracking] = useState(Boolean(org.expiry_tracking))
  const [decimalQty, setDecimalQty] = useState(Boolean(org.decimal_qty))
  const [decimalQtyPlaces, setDecimalQtyPlaces] = useState(String(org.decimal_qty_places ?? '2'))

  async function saveProductSetting(key: string, value: unknown) {
    await fetch('/api/org/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    showToast('success', 'Setting saved')
  }

  // Units of Measure
  const [uoms, setUoms] = useState<Uom[]>([])
  const [addingUom, setAddingUom] = useState(false)
  const [newUomName, setNewUomName] = useState('')
  const [newUomAbbr, setNewUomAbbr] = useState('')

  useEffect(() => {
    fetch('/api/org/uoms').then(r => r.json()).then(data => { if (Array.isArray(data)) setUoms(data) })
  }, [])

  async function addUom() {
    if (!newUomName.trim()) return
    const res = await fetch('/api/org/uoms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newUomName.trim(), abbr: newUomAbbr.trim() }),
    })
    const data = await res.json()
    if (res.ok) { setUoms(prev => [...prev, data]); setNewUomName(''); setNewUomAbbr(''); setAddingUom(false) }
    else showToast('error', data.error ?? 'Failed to add unit')
  }

  async function renameUom(id: string, name: string) {
    setUoms(prev => prev.map(u => u.id === id ? { ...u, name } : u))
    await fetch(`/api/org/uoms/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  }

  async function updateUomAbbr(id: string, abbr: string) {
    setUoms(prev => prev.map(u => u.id === id ? { ...u, abbr } : u))
    await fetch(`/api/org/uoms/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abbr }) })
  }

  async function deleteUom(id: string) {
    setUoms(prev => prev.filter(u => u.id !== id))
    await fetch(`/api/org/uoms/${id}`, { method: 'DELETE' })
  }

  // Price Levels
  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([])

  useEffect(() => {
    fetch('/api/org/price-levels').then(r => r.json()).then(data => { if (Array.isArray(data)) setPriceLevels(data) })
  }, [])

  async function addPriceLevel() {
    const name = `Price Level ${priceLevels.length + 1}`
    const res = await fetch('/api/org/price-levels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (res.ok) setPriceLevels(prev => [...prev, data])
    else showToast('error', data.error ?? 'Failed to add price level')
  }

  async function renamePriceLevel(id: string, name: string) {
    setPriceLevels(prev => prev.map(pl => pl.id === id ? { ...pl, name } : pl))
    await fetch(`/api/org/price-levels/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  }

  async function setDefaultPriceLevel(id: string) {
    setPriceLevels(prev => prev.map(pl => ({ ...pl, is_default: pl.id === id })))
    await fetch(`/api/org/price-levels/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: true }) })
    showToast('success', 'Default price level updated')
  }

  async function deletePriceLevel(id: string) {
    setPriceLevels(prev => prev.filter(pl => pl.id !== id))
    await fetch(`/api/org/price-levels/${id}`, { method: 'DELETE' })
  }

  // Purchases settings
  const [allowOverReceive, setAllowOverReceive] = useState(false)
  const [poPrefix, setPoPrefix] = useState('PO-')
  const [poStart, setPoStart] = useState('1')

  // Sales settings
  const [fulfilmentMode, setFulfilmentMode] = useState('full')
  const [autoPicking, setAutoPicking] = useState(false)
  const [allowOverPicking, setAllowOverPicking] = useState(false)
  const [pickingRule, setPickingRule] = useState('FIFO')
  const [soPrefix, setSoPrefix] = useState('SO-')
  const [soStart, setSoStart] = useState('1')
  const [defCarrier, setDefCarrier] = useState('NZ Post')
  const [defShipping, setDefShipping] = useState('Standard Courier')

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // Logo upload
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) { showToast('error', 'Logo must be under 1MB'); return }
    if (!['image/jpeg', 'image/png'].includes(file.type)) { showToast('error', 'Only JPG or PNG allowed'); return }
    setUploadingLogo(true)
    const form = new FormData(); form.append('file', file)
    const res = await fetch('/api/org/logo', { method: 'POST', body: form })
    const data = await res.json()
    setUploadingLogo(false)
    if (res.ok) { setLogoUrl(data.url); setLogoPreview(data.url); showToast('success', 'Logo uploaded') }
    else showToast('error', data.error ?? 'Upload failed')
    e.target.value = ''
  }

  async function saveOrg() {
    setSavingOrg(true)
    const res = await fetch('/api/org/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: bizName, email: bizEmail, phone: bizPhone, address: bizAddress,
        website, abn_nzbn: abn, gst_number: gstNumber,
        country, base_currency: currencyLocked ? undefined : baseCurrency,
        timezone, date_format: dateFormat, decimal_places: parseInt(decimalPlaces) || 2,
        logo_url: logoUrl || undefined,
      }),
    })
    setSavingOrg(false)
    if (res.ok) showToast('success', 'Business details saved')
    else showToast('error', 'Failed to save')
  }

  async function addTaxRate() {
    if (!newTaxName.trim() || !newTaxCode.trim() || !newTaxRate) return
    setAddingTax(true)
    const res = await fetch('/api/org/tax-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTaxName.trim(), code: newTaxCode.trim(), rate: parseFloat(newTaxRate), is_default: false }),
    })
    const data = await res.json()
    setAddingTax(false)
    if (res.ok) {
      setTaxRates(prev => [...prev, { id: data.id, name: newTaxName.trim(), code: newTaxCode.trim(), rate: parseFloat(newTaxRate), is_default: false }])
      setNewTaxName(''); setNewTaxCode(''); setNewTaxRate('')
      showToast('success', 'Tax rate added')
    } else showToast('error', data.error ?? 'Failed to add tax rate')
  }

  async function deleteTaxRate(id: string) {
    await fetch(`/api/org/tax-rates/${id}`, { method: 'DELETE' })
    setTaxRates(prev => prev.filter(t => t.id !== id))
    showToast('success', 'Tax rate removed')
  }

  async function addCurrency() {
    if (!newCurrCode.trim() || !newCurrName.trim() || !newCurrRate) return
    const res = await fetch('/api/org/currencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCurrCode.trim().toUpperCase(), name: newCurrName.trim(), rate: parseFloat(newCurrRate) }),
    })
    const data = await res.json()
    if (res.ok) {
      setCurrencies(prev => [...prev, { id: data.id, code: newCurrCode.trim().toUpperCase(), name: newCurrName.trim(), rate: parseFloat(newCurrRate), symbol: null }])
      setNewCurrCode(''); setNewCurrName(''); setNewCurrRate('')
      showToast('success', 'Currency added')
    } else showToast('error', data.error ?? 'Failed to add currency')
  }

  async function deleteCurrency(id: string) {
    await fetch(`/api/org/currencies/${id}`, { method: 'DELETE' })
    setCurrencies(prev => prev.filter(c => c.id !== id))
    showToast('success', 'Currency removed')
  }

  async function toggleLocation(id: string, active: boolean) {
    await fetch(`/api/org/locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    setLocations(prev => prev.map(l => l.id === id ? { ...l, active } : l))
  }

  const poPreview = `${poPrefix}${String(parseInt(poStart) || 1).padStart(4, '0')}`
  const soPreview = `${soPrefix}${String(parseInt(soStart) || 1).padStart(4, '0')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Page header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-100)', padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="page-title">Settings</div>
            <div className="page-subtitle">Manage your workspace configuration</div>
          </div>
        </div>
        <div className="tab-bar">
          {TABS.map(t => (
            <div key={t.key} className={`tab-item${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>
          ))}
        </div>
      </div>

      {/* Content — same horizontal padding as header */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 60px' }}>

        {/* ── GENERAL ── */}
        {tab === 'general' && (
          <>
            {/* Business Details */}
            <Card title="Business Details" subtitle="Your organisation's core information" action={<SaveBtn onClick={saveOrg} saving={savingOrg} />}>
              <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                {/* Business Name — full width */}
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label className="modal-label">Business Name</label>
                  <MInput value={bizName} onChange={setBizName} placeholder="Acme Ltd" />
                </div>

                {/* Address — full width */}
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label className="modal-label">Address</label>
                  <MInput value={bizAddress} onChange={setBizAddress} placeholder="123 Main St, Auckland 1010" />
                </div>

                <Field label="Phone"><MInput value={bizPhone} onChange={setBizPhone} placeholder="+64 9 000 0000" /></Field>
                <Field label="Email"><MInput value={bizEmail} onChange={setBizEmail} placeholder="orders@business.com" type="email" /></Field>

                <Field label="Website"><MInput value={website} onChange={setWebsite} placeholder="www.yourbusiness.com" /></Field>
                <Field label="NZBN / ABN"><MInput value={abn} onChange={setAbn} placeholder="e.g. 9429000000000" /></Field>

                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label className="modal-label">GST / Tax Number</label>
                  <MInput value={gstNumber} onChange={setGstNumber} placeholder="e.g. 123-456-789" />
                </div>

                {/* Logo upload */}
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label className="modal-label">Logo <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 400, marginLeft: 4 }}>JPG or PNG, max 1MB — used on printed orders</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 60, height: 50, borderRadius: 8, border: '1.5px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {logoPreview
                        ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                    </div>
                    <div>
                      <button className="btn btn-outline" style={{ height: 32, fontSize: 12 }} onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
                      </button>
                      <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 4 }}>{logoPreview ? 'Logo uploaded' : 'No logo uploaded'}</div>
                      <input ref={logoRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={handleLogoUpload} />
                    </div>
                  </div>
                </div>

                {/* Country + Base Currency */}
                <Field label="Country">
                  <Select value={country} onChange={setCountry} options={['New Zealand','Australia','United States','United Kingdom','Canada','Singapore'].map(c => ({ value: c, label: c }))} />
                </Field>
                <div className="modal-field">
                  <label className="modal-label">
                    Base Currency
                    {currencyLocked && <LockBadge label="Locked after first transaction" />}
                  </label>
                  <Select value={baseCurrency} onChange={setBaseCurrency} disabled={currencyLocked} options={[
                    { value: 'NZD', label: 'NZD — New Zealand Dollar' },
                    { value: 'AUD', label: 'AUD — Australian Dollar' },
                    { value: 'USD', label: 'USD — US Dollar' },
                    { value: 'GBP', label: 'GBP — British Pound' },
                    { value: 'EUR', label: 'EUR — Euro' },
                    { value: 'SGD', label: 'SGD — Singapore Dollar' },
                  ]} />
                </div>

                {/* Timezone + Date Format */}
                <Field label="Timezone">
                  <Select value={timezone} onChange={setTimezone} options={[
                    { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12)' },
                    { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10)' },
                    { value: 'Australia/Perth', label: 'Australia/Perth (UTC+8)' },
                    { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
                    { value: 'Europe/London', label: 'Europe/London (UTC+0)' },
                    { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
                    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8)' },
                  ]} />
                </Field>
                <Field label="Date Format">
                  <Select value={dateFormat} onChange={setDateFormat} options={[
                    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                  ]} />
                </Field>

                {/* Decimal Places */}
                <Field label="Max Decimal Places">
                  <Select value={decimalPlaces} onChange={setDecimalPlaces} options={[
                    { value: '0', label: '0 decimal places' },
                    { value: '1', label: '1 decimal place' },
                    { value: '2', label: '2 decimal places' },
                    { value: '3', label: '3 decimal places' },
                    { value: '4', label: '4 decimal places' },
                  ]} />
                </Field>
              </div>
            </Card>

            {/* Tax Rates */}
            <Card title="Tax Rates" subtitle="Define tax codes used across the system" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addTaxRate} disabled={addingTax}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Tax Rate
              </button>
            }>
              <div style={{ padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end', borderBottom: '1px solid var(--gray-100)' }}>
                <Field label="Tax Name"><MInput value={newTaxName} onChange={setNewTaxName} placeholder="e.g. GST" /></Field>
                <Field label="Tax Code"><MInput value={newTaxCode} onChange={setNewTaxCode} placeholder="e.g. GST15" /></Field>
                <Field label="Rate (%)"><MInput value={newTaxRate} onChange={setNewTaxRate} placeholder="e.g. 15" type="number" /></Field>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th className="li-th" style={{ width: 120 }}>Tax Code</th>
                    <th className="li-th">Name</th>
                    <th className="li-th" style={{ width: 100, textAlign: 'right' }}>Rate (%)</th>
                    <th className="li-th" style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {taxRates.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>No tax rates configured.</td></tr>}
                  {taxRates.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{t.code}</span></td>
                      <td className="li-td" style={{ color: 'var(--gray-900)', fontSize: 13 }}>{t.name}</td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', paddingRight: 20 }}>{t.rate}%</td>
                      <td className="li-td" style={{ textAlign: 'center' }}>
                        <button onClick={() => deleteTaxRate(t.id)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Locations & Bins */}
            <Card
              title="Locations & Bins"
              subtitle="Warehouses, stores and their bin locations"
              action={
                <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={() => setShowAddLoc(true)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Location
                </button>
              }
            >
              <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {locations.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: 13 }}>No locations yet. Add one to get started.</div>
                )}
                {locations.map(l => (
                  <div key={l.id} style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Location row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{l.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{l.type}{l.address ? ` · ${l.address}` : ''}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => setEditLocModal(l)} style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid var(--gray-200)', background: 'var(--white)', cursor: 'pointer', color: 'var(--gray-400)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Edit location"
                          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' }}
                          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-400)' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <span style={{ fontSize: 12, color: l.active ? '#059669' : 'var(--gray-400)', fontWeight: 600 }}>{l.active ? 'Active' : 'Inactive'}</span>
                        <button className="status-toggle" data-active={String(l.active)} onClick={() => toggleLocation(l.id, !l.active)} type="button">
                          <div className="status-toggle-knob" />
                        </button>
                      </div>
                    </div>
                    {/* Bins row */}
                    <div style={{ borderTop: '1px solid var(--gray-200)', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Bins</span>
                        {(l.bins?.length ?? 0) > 0
                          ? <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-surface)', border: '1px solid var(--teal-pale)', borderRadius: 20, padding: '1px 8px' }}>{l.bins!.length} {l.bins!.length === 1 ? 'bin' : 'bins'}</span>
                          : <span style={{ fontSize: 11.5, color: 'var(--gray-300)' }}>None</span>
                        }
                      </div>
                      <button className="btn btn-outline" style={{ height: 28, fontSize: 11.5, padding: '0 10px' }} onClick={() => setBinsModal(l)}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        Manage Bins
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Currencies */}
            <Card title="Currencies" subtitle="Additional currencies and exchange rates" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addCurrency}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Currency
              </button>
            }>
              <div style={{ padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end', borderBottom: '1px solid var(--gray-100)' }}>
                <Field label="Code"><MInput value={newCurrCode} onChange={setNewCurrCode} placeholder="e.g. USD" /></Field>
                <Field label="Name"><MInput value={newCurrName} onChange={setNewCurrName} placeholder="e.g. US Dollar" /></Field>
                <Field label="Exchange Rate"><MInput value={newCurrRate} onChange={setNewCurrRate} placeholder="e.g. 0.62" type="number" /></Field>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th className="li-th" style={{ width: 100 }}>Code</th>
                    <th className="li-th">Name</th>
                    <th className="li-th" style={{ width: 140, textAlign: 'right' }}>Rate to {String(baseCurrency)}</th>
                    <th className="li-th" style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {currencies.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>No additional currencies.</td></tr>}
                  {currencies.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>{c.code}</span></td>
                      <td className="li-td" style={{ color: 'var(--gray-900)', fontSize: 13 }}>{c.name}</td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)', paddingRight: 20 }}>{c.rate}</td>
                      <td className="li-td" style={{ textAlign: 'center' }}>
                        <button onClick={() => deleteCurrency(c.id)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-400)')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {/* ── CONTACTS ── */}
        {tab === 'contacts' && (
          <ContactsTab
            taxRates={taxRates}
            currencies={currencies}
            locations={locations}
            priceLevels={priceLevels}
            orgId={orgId}
            showToast={showToast}
          />
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <>
            <Card title="Inventory Tracking" subtitle="Configure serial and batch tracking defaults">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ToggleRow label="Serial Number Tracking" sub="Track individual serial numbers for each unit received" active={serialTracking} onChange={v => { setSerialTracking(v); saveProductSetting('serial_tracking', v) }} />
                <ToggleRow label="Batch / Lot Tracking" sub="Group received items into batches or lots for traceability" active={batchTracking} onChange={v => { setBatchTracking(v); saveProductSetting('batch_tracking', v) }} />
                <ToggleRow label="Expiry Date Tracking" sub="All new products will have expiry date tracking enabled by default" active={expiryTracking} onChange={v => { setExpiryTracking(v); saveProductSetting('expiry_tracking', v) }} />
              </div>
            </Card>
            <Card title="Quantity Settings" subtitle="Control how quantities are entered and displayed">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ToggleRow label="Allow Decimal Quantities" sub="Enables buying and selling in fractional quantities (e.g. 0.5, 1.25)" active={decimalQty} onChange={v => { setDecimalQty(v); saveProductSetting('decimal_qty', v) }} />
                {decimalQty && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>Decimal Places</div>
                      <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>Number of decimal places shown on qty and price fields</div>
                    </div>
                    <select className="modal-input" value={decimalQtyPlaces} onChange={e => { setDecimalQtyPlaces(e.target.value); saveProductSetting('decimal_qty_places', parseInt(e.target.value)) }} style={{ width: 160, marginLeft: 16 }}>
                      {[1,2,3,4].map(n => <option key={n} value={String(n)}>{n} (e.g. {(1).toFixed(n)})</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Card>
            {/* Units of Measure */}
            <Card title="Units of Measure" subtitle="Define units available when creating or editing products" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={() => setAddingUom(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Unit
              </button>
            }>
              {addingUom && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="modal-input" placeholder="Name (e.g. Kilogram)" value={newUomName} onChange={e => setNewUomName(e.target.value)} style={{ flex: 2 }} onKeyDown={e => e.key === 'Enter' && addUom()} />
                  <input className="modal-input" placeholder="Abbr (e.g. kg)" value={newUomAbbr} onChange={e => setNewUomAbbr(e.target.value)} style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && addUom()} />
                  <button className="btn btn-primary" style={{ height: 34, fontSize: 12.5, whiteSpace: 'nowrap' }} onClick={addUom}>Add</button>
                  <button className="btn" style={{ height: 34, fontSize: 12.5 }} onClick={() => { setAddingUom(false); setNewUomName(''); setNewUomAbbr('') }}>Cancel</button>
                </div>
              )}
              <div style={{ padding: '8px 0' }}>
                {uoms.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-300)', fontSize: 12.5 }}>No units yet.</div>}
                {uoms.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--gray-100)' }}>
                    <InlineEditable value={u.name} onChange={name => renameUom(u.id, name)} style={{ flex: 1, fontWeight: 500, color: 'var(--slate)', fontSize: 13.5 }} />
                    <InlineEditable value={u.abbr} onChange={abbr => updateUomAbbr(u.id, abbr)} style={{ width: 80, textAlign: 'right', color: 'var(--gray-400)', fontSize: 12.5 }} />
                    {!u.in_use ? (
                      <button onClick={() => deleteUom(u.id)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-300)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-300)')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    ) : (
                      <div style={{ width: 36, marginLeft: 8 }} />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Price Levels */}
            <Card title="Price Levels" subtitle="Define pricing tiers used across products — set per-product prices in the product's Pricing tab" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addPriceLevel}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Level
              </button>
            }>
              <div style={{ padding: '8px 0' }}>
                {priceLevels.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-300)', fontSize: 12.5 }}>No price levels yet.</div>}
                {priceLevels.map(pl => (
                  <div key={pl.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--gray-100)', background: pl.is_default ? 'var(--teal-surface)' : 'var(--white)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: pl.is_default ? 'var(--teal)' : 'var(--gray-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={pl.is_default ? 'white' : 'var(--gray-400)'} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <InlineEditable value={pl.name} onChange={name => renamePriceLevel(pl.id, name)} style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--slate)' }} />
                    {pl.is_default ? (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', background: 'rgba(13,148,136,0.12)', padding: '3px 10px', borderRadius: 20, marginRight: 8 }}>Default</span>
                    ) : (
                      <button onClick={() => setDefaultPriceLevel(pl.id)} style={{ fontSize: 12, color: 'var(--gray-400)', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 20, padding: '3px 10px', cursor: 'pointer', marginRight: 8, fontWeight: 500 }}
                        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                        onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--gray-200)')}>Set default</button>
                    )}
                    {!pl.is_default && (
                      <button onClick={() => deletePriceLevel(pl.id)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-300)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--gray-300)')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* ── PURCHASES ── */}
        {tab === 'purchases' && (
          <>
            <Card title="Receiving Settings" subtitle="Control how stock is received against purchase orders" action={<SaveBtn onClick={() => showToast('success', 'Receiving settings saved')} />}>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ToggleRow label="Allow Over-Receiving" sub="Allow users to receive more units than ordered on a line" active={allowOverReceive} onChange={setAllowOverReceive} />
              </div>
            </Card>
            <Card title="Purchase Order Numbering" subtitle="Configure auto-generated PO numbers" action={<SaveBtn onClick={() => showToast('success', 'PO numbering saved')} />}>
              <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <Field label="Prefix (up to 4 chars)">
                  <input className="modal-input" value={poPrefix} onChange={e => setPoPrefix(e.target.value)} maxLength={4} style={{ background: 'var(--white)', fontFamily: 'monospace', fontWeight: 700 }} />
                </Field>
                <Field label="Start Number"><MInput value={poStart} onChange={setPoStart} type="number" placeholder="1" /></Field>
                <Field label="Preview">
                  <div style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 9, padding: '9px 14px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--slate)' }}>{poPreview}</div>
                </Field>
              </div>
            </Card>
          </>
        )}

        {/* ── TRANSFERS ── */}
        {tab === 'transfers' && (
          <Card title="Transfer Order Numbering" subtitle="Configure auto-generated Transfer numbers" action={<SaveBtn onClick={() => showToast('success', 'Transfer numbering saved')} />}>
            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Prefix (up to 4 chars)">
                <input className="modal-input" value="TR-" readOnly style={{ background: 'var(--gray-50)', fontFamily: 'monospace', fontWeight: 700, opacity: 0.7 }} />
              </Field>
              <Field label="Start Number"><MInput value="1" onChange={() => {}} type="number" /></Field>
              <Field label="Preview">
                <div style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 9, padding: '9px 14px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--slate)' }}>TR-0001</div>
              </Field>
            </div>
          </Card>
        )}

        {/* ── SALES ── */}
        {tab === 'sales' && (
          <>
            <Card title="Fulfilment Mode" subtitle="Controls which steps are required to close a sales order">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { value: 'full', label: 'Full — Pick → Pack → Close', sub: 'All steps required. Default for most businesses.' },
                  { value: 'pick-only', label: 'Pick Only — Pick → Close', sub: 'Skips packing. Confirming pick closes the order.' },
                  { value: 'none', label: 'None — Close Directly', sub: 'Orders can be closed at any stage.' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: 'var(--gray-50)', border: `1.5px solid ${fulfilmentMode === opt.value ? 'var(--teal)' : 'var(--gray-200)'}`, borderRadius: 10, cursor: 'pointer' }}>
                    <input type="radio" name="fulfilment" value={opt.value} checked={fulfilmentMode === opt.value} onChange={() => setFulfilmentMode(opt.value)} style={{ marginTop: 3, accentColor: 'var(--teal)' }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{opt.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Card>
            <Card title="Picking" subtitle="Control how stock is picked for sales orders">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ToggleRow label="Auto Picking" sub="Stock is picked automatically using the rule below when Pick Order is clicked" active={autoPicking} onChange={setAutoPicking} />
                {autoPicking && (
                  <div style={{ padding: '14px 16px', background: 'var(--teal-surface)', border: '1.5px solid var(--teal-pale)', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 10 }}>Auto-Picking Rule</div>
                    {[{ value: 'FIFO', label: 'FIFO — First In, First Out', sub: 'Picks the oldest stock first.' },
                      { value: 'LIFO', label: 'LIFO — Last In, First Out', sub: 'Picks the most recently received stock first.' },
                      { value: 'FEFO', label: 'FEFO — First Expired, First Out', sub: 'Picks stock with earliest expiry first.' }].map(r => (
                      <label key={r.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
                        <input type="radio" name="pickRule" value={r.value} checked={pickingRule === r.value} onChange={() => setPickingRule(r.value)} style={{ marginTop: 3, accentColor: 'var(--teal)' }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{r.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{r.sub}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <ToggleRow label="Allow Over Picking" sub="Allow users to pick more stock than the ordered quantity" active={allowOverPicking} onChange={setAllowOverPicking} />
              </div>
            </Card>
            <Card title="Sales Order Numbering" subtitle="Configure auto-generated SO numbers" action={<SaveBtn onClick={() => showToast('success', 'SO numbering saved')} />}>
              <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <Field label="Prefix">
                  <input className="modal-input" value={soPrefix} onChange={e => setSoPrefix(e.target.value)} maxLength={4} style={{ background: 'var(--white)', fontFamily: 'monospace', fontWeight: 700 }} />
                </Field>
                <Field label="Start Number"><MInput value={soStart} onChange={setSoStart} type="number" /></Field>
                <Field label="Preview">
                  <div style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 9, padding: '9px 14px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--slate)' }}>{soPreview}</div>
                </Field>
              </div>
            </Card>
            <Card title="Shipping Defaults" subtitle="Default carrier and method for new shipments" action={<SaveBtn onClick={() => showToast('success', 'Shipping defaults saved')} />}>
              <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Default Carrier">
                  <Select value={defCarrier} onChange={setDefCarrier} options={['NZ Post','Aramex','DHL','FedEx','Aus Post','UPS','TNT','Other'].map(c => ({ value: c, label: c }))} />
                </Field>
                <Field label="Default Shipping Method">
                  <Select value={defShipping} onChange={setDefShipping} options={['Standard Courier','Express Courier','Overnight','Road Freight','Air Freight','Customer Pickup','Other'].map(s => ({ value: s, label: s }))} />
                </Field>
              </div>
            </Card>
          </>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <Card title="Team Members" subtitle="Manage who has access to your organisation">
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>Manage your team members, roles and invitations.</p>
              <Link href="/settings/users" className="btn btn-primary" style={{ display: 'inline-flex' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Manage Team
              </Link>
            </div>
          </Card>
        )}

        {/* ── SECURITY ── */}
        {tab === 'security' && (
          <Card title="Security" subtitle="Account security settings">
            <div style={{ padding: '20px', color: 'var(--gray-400)', fontSize: 13, textAlign: 'center' }}>Security settings coming soon.</div>
          </Card>
        )}

        {/* ── INTEGRATIONS ── */}
        {tab === 'integrations' && (
          <Card title="Integrations" subtitle="Connect third-party apps and services">
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { name: 'Xero', sub: 'Sync invoices, bills and contacts with Xero accounting', icon: '💼', status: 'Coming soon' },
                { name: 'Starshipit', sub: 'Generate shipping labels and track parcels', icon: '📦', status: 'Coming soon' },
                { name: 'Shopify', sub: 'Sync orders and inventory with your Shopify store', icon: '🛒', status: 'Coming soon' },
              ].map(int => (
                <div key={int.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--white)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{int.icon}</div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{int.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>{int.sub}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '3px 10px', borderRadius: 20 }}>{int.status}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Modals */}
      {showAddLoc && (
        <AddLocationModal
          orgId={orgId}
          onClose={() => setShowAddLoc(false)}
          onAdd={loc => setLocations(prev => [...prev, loc])}
        />
      )}

      {editLocModal && (
        <EditLocationModal
          location={editLocModal}
          onClose={() => setEditLocModal(null)}
          onSave={updated => {
            setLocations(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
            setEditLocModal(null)
          }}
        />
      )}

      {binsModal && (
        <BinsModal
          location={binsModal}
          orgId={orgId}
          onClose={() => setBinsModal(null)}
          onUpdate={(locationId, bins) => {
            setLocations(prev => prev.map(l => l.id === locationId ? { ...l, bins } : l))
            setBinsModal(prev => prev ? { ...prev, bins } : null)
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            <div className="toast-icon">
              {toast.type === 'success'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              }
            </div>
            <div className="toast-body"><div className="toast-title">{toast.msg}</div></div>
            <button className="toast-close" onClick={() => setToast(null)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
