'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Contact = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  bill_city: string | null
  bill_country: string | null
  bill_street: string | null
  bill_postcode: string | null
  ship_name: string | null
  ship_street: string | null
  ship_city: string | null
  ship_postcode: string | null
  ship_country: string | null
  currency: string | null
  tier: string | null
  terms: string | null
  tax_rate: string | null
  balance_owing: number | null
  credit_limit: number | null
  disc_type: string | null
  disc_value: number | null
  tax_number: string | null
  website: string | null
  notes: string | null
  is_active: boolean | null
  status: string | null
}

type ModalForm = {
  name: string
  type: string
  email: string
  phone: string
  website: string
  tax_number: string
  currency: string
  tier: string
  terms: string
  tax_rate: string
  credit_limit: string
  disc_type: string
  disc_value: string
  bill_street: string
  bill_city: string
  bill_postcode: string
  bill_country: string
  ship_name: string
  ship_street: string
  ship_city: string
  ship_postcode: string
  ship_country: string
  notes: string
  is_active: boolean
}

const EMPTY_FORM: ModalForm = {
  name: '', type: 'supplier', email: '', phone: '', website: '', tax_number: '',
  currency: 'NZD', tier: 'Retail', terms: 'Net 30', tax_rate: '',
  credit_limit: '0', disc_type: 'percent', disc_value: '0',
  bill_street: '', bill_city: '', bill_postcode: '', bill_country: 'New Zealand',
  ship_name: '', ship_street: '', ship_city: '', ship_postcode: '', ship_country: 'New Zealand',
  notes: '', is_active: true,
}

const AVATAR_COLORS = [
  '#0D9488','#0891B2','#7C3AED','#DB2777','#D97706','#059669','#DC2626','#2563EB',
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function typeBadge(type: string) {
  if (type === 'customer') return <span className="badge badge-customer">Customer</span>
  if (type === 'supplier') return <span className="badge badge-supplier">Supplier</span>
  return <span className="badge badge-both">Both</span>
}

function statusBadge(active: boolean) {
  return active
    ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46' }}>Active</span>
    : <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>Inactive</span>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="modal-field">
      <label className="modal-label">{label}{required && <span className="req"> *</span>}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      className="modal-input"
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="modal-input" value={value} onChange={e => onChange(e.target.value)} style={{ cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function ContactsTable({
  contacts: initialContacts,
  orgId,
  isAdmin,
}: {
  contacts: Contact[]
  orgId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [contacts, setContacts] = useState(initialContacts)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tab, setTab] = useState<'all' | 'customer' | 'supplier'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [typeOpen, setTypeOpen] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM)
  const [modalTab, setModalTab] = useState<'details' | 'address' | 'financial'>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sameAddress, setSameAddress] = useState(false)

  function set(field: keyof ModalForm, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setModalTab('details')
    setError(null)
    setSameAddress(false)
    setModalOpen(true)
  }

  function openEdit(c: Contact) {
    setForm({
      name: c.name,
      type: c.type,
      email: c.email ?? '',
      phone: c.phone ?? '',
      website: c.website ?? '',
      tax_number: c.tax_number ?? '',
      currency: c.currency ?? 'NZD',
      tier: c.tier ?? 'Retail',
      terms: c.terms ?? 'Net 30',
      tax_rate: c.tax_rate ?? '',
      credit_limit: String(c.credit_limit ?? 0),
      disc_type: c.disc_type ?? 'percent',
      disc_value: String(c.disc_value ?? 0),
      bill_street: c.bill_street ?? '',
      bill_city: c.bill_city ?? '',
      bill_postcode: c.bill_postcode ?? '',
      bill_country: c.bill_country ?? 'New Zealand',
      ship_name: c.ship_name ?? '',
      ship_street: c.ship_street ?? '',
      ship_city: c.ship_city ?? '',
      ship_postcode: c.ship_postcode ?? '',
      ship_country: c.ship_country ?? 'New Zealand',
      notes: c.notes ?? '',
      is_active: c.is_active ?? true,
    })
    setEditingId(c.id)
    setModalTab('details')
    setError(null)
    setSameAddress(false)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setError(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Contact name is required.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      type: form.type,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      tax_number: form.tax_number || null,
      currency: form.currency,
      tier: form.tier,
      terms: form.terms,
      tax_rate: form.tax_rate || null,
      credit_limit: parseFloat(form.credit_limit) || 0,
      disc_type: form.disc_type,
      disc_value: parseFloat(form.disc_value) || 0,
      bill_street: form.bill_street || null,
      bill_city: form.bill_city || null,
      bill_postcode: form.bill_postcode || null,
      bill_country: form.bill_country || null,
      ship_name: form.ship_name || null,
      ship_street: sameAddress ? form.bill_street || null : form.ship_street || null,
      ship_city: sameAddress ? form.bill_city || null : form.ship_city || null,
      ship_postcode: sameAddress ? form.bill_postcode || null : form.ship_postcode || null,
      ship_country: sameAddress ? form.bill_country || null : form.ship_country || null,
      notes: form.notes || null,
      is_active: form.is_active,
      status: form.is_active ? 'active' : 'inactive',
      org_id: orgId,
    }

    const url = editingId ? `/api/org/contacts/${editingId}` : '/api/org/contacts'
    const method = editingId ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }

    // Update local state without full page reload
    if (editingId) {
      setContacts(prev => prev.map(c => c.id === editingId ? { ...c, ...payload, id: editingId } : c))
    } else {
      setContacts(prev => [...prev, { ...payload, id: data.id, balance_owing: 0 }] as Contact[])
    }
    closeModal()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/org/contacts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setContacts(prev => prev.filter(c => c.id !== id))
    }
  }

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (!showInactive && !c.is_active) return false
      if (tab !== 'all' && c.type !== tab) return false
      if (typeFilter && c.type !== typeFilter.toLowerCase()) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.bill_city ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [contacts, search, typeFilter, tab, showInactive])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const counts = useMemo(() => ({
    all: contacts.filter(c => showInactive || c.is_active).length,
    customer: contacts.filter(c => c.type === 'customer' && (showInactive || c.is_active)).length,
    supplier: contacts.filter(c => c.type === 'supplier' && (showInactive || c.is_active)).length,
  }), [contacts, showInactive])

  function pickTab(t: typeof tab) {
    setTab(t)
    setTypeFilter('')
    setPage(1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Contacts</div>
            <div className="page-subtitle">Customers &amp; suppliers in one place</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Contact
            </button>
          </div>
        </div>
        <div className="tab-bar">
          {(['all', 'customer', 'supplier'] as const).map(t => (
            <div key={t} className={`tab-item${tab === t ? ' active' : ''}`} onClick={() => pickTab(t)}>
              {t === 'all' ? 'All' : t === 'customer' ? 'Customers' : 'Suppliers'}
              <span className="tab-count">{counts[t]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar-card">
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search contacts…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${typeFilter ? ' active-filter' : ''}`} onClick={() => setTypeOpen(o => !o)}>
            <span>{typeFilter || 'All Types'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }}>
              <div className="col-dropdown-title">Type</div>
              {['', 'Customer', 'Supplier'].map(v => (
                <div key={v} className={`fp-item${typeFilter === v ? ' active' : ''}`} onClick={() => { setTypeFilter(v); setPage(1); setTypeOpen(false) }}>
                  {v || 'All Types'}
                </div>
              ))}
            </div>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showInactive} onChange={e => { setShowInactive(e.target.checked); setPage(1) }} style={{ accentColor: 'var(--teal)', cursor: 'pointer', width: 14, height: 14 }} />
          Show inactive
        </label>
        <div className="filter-spacer" />
        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}><strong style={{ color: 'var(--slate)' }}>{filtered.length}</strong> contacts</span>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Currency</th>
                <th>Price Tier</th>
                <th>Payment Terms</th>
                <th>Tax Rate</th>
                <th>City</th>
                <th>Email</th>
                <th>Phone</th>
                <th style={{ textAlign: 'right' }}>Balance Owing</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No contacts match your search.' : 'No contacts yet. Add one to get started.'}
                  </td>
                </tr>
              )}
              {paginated.map(c => (
                <tr key={c.id} onClick={() => openEdit(c)}>
                  <td>
                    <div className="contact-cell">
                      <div className="contact-avatar" style={{ background: avatarColor(c.name), color: '#fff' }}>{initials(c.name)}</div>
                      <div>
                        <div className="contact-name">{c.name}</div>
                        {c.tax_number && <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{c.tax_number}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{typeBadge(c.type)}</td>
                  <td>{statusBadge(c.is_active ?? true)}</td>
                  <td className="td-muted">{c.currency ?? '—'}</td>
                  <td className="td-muted">{c.tier ?? '—'}</td>
                  <td className="td-muted">{c.terms ?? '—'}</td>
                  <td className="td-muted">{c.tax_rate ?? '—'}</td>
                  <td className="td-muted">{[c.bill_city, c.bill_country].filter(Boolean).join(', ') || '—'}</td>
                  <td className="td-muted">{c.email ?? '—'}</td>
                  <td className="td-mono">{c.phone ?? '—'}</td>
                  <td style={{ textAlign: 'right' }} className="td-muted">{c.balance_owing ? `$${Number(c.balance_owing).toFixed(2)}` : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); openEdit(c) }} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="row-action-btn danger" onClick={e => { e.stopPropagation(); handleDelete(c.id, c.name) }} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="footer-left">
            <span className="per-page-label">Rows per page</span>
            <select className="per-page-select" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="pagination">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i
              return <button key={p} className={`page-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            })}
            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL ── */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal-box" style={{ maxWidth: 700 }}>

            {/* Header */}
            <div className="modal-header">
              <div>
                <div className="modal-title">{editingId ? 'Edit Contact' : 'New Contact'}</div>
                <div className="modal-subtitle">{editingId ? 'Update contact details' : 'Add a new supplier or customer'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Active toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--gray-400)' }}>
                  <span>{form.is_active ? 'Active' : 'Inactive'}</span>
                  <button
                    className="status-toggle"
                    data-active={String(form.is_active)}
                    onClick={() => set('is_active', !form.is_active)}
                    type="button"
                  >
                    <div className="status-toggle-knob" />
                  </button>
                </div>
                <button className="modal-close" onClick={closeModal}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="modal-tab-bar">
              {(['details', 'address', 'financial'] as const).map(t => (
                <div key={t} className={`modal-tab${modalTab === t ? ' active' : ''}`} onClick={() => setModalTab(t)}>
                  {t === 'details' ? 'Details' : t === 'address' ? 'Addresses' : 'Financial'}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="modal-body">

              {/* ── DETAILS TAB ── */}
              {modalTab === 'details' && (
                <>
                  {/* Type selector */}
                  <div className="modal-field">
                    <label className="modal-label">Type <span className="req">*</span></label>
                    <div className="modal-seg">
                      {['supplier', 'customer', 'both'].map(t => (
                        <button key={t} type="button" className={`seg-btn${form.type === t ? ' active' : ''}`} onClick={() => set('type', t)}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Contact Name" required>
                    <Input value={form.name} onChange={v => set('name', v)} placeholder="e.g. Acme Supplies Ltd" />
                  </Field>

                  <div className="modal-grid-2">
                    <Field label="Email">
                      <Input value={form.email} onChange={v => set('email', v)} placeholder="orders@example.com" type="email" />
                    </Field>
                    <Field label="Phone">
                      <Input value={form.phone} onChange={v => set('phone', v)} placeholder="+64 9 000 0000" />
                    </Field>
                    <Field label="Website">
                      <Input value={form.website} onChange={v => set('website', v)} placeholder="www.example.com" />
                    </Field>
                    <Field label="NZBN / ABN / Tax Number">
                      <Input value={form.tax_number} onChange={v => set('tax_number', v)} placeholder="e.g. 9429000000000" />
                    </Field>
                  </div>

                  <Field label="Notes">
                    <textarea
                      className="modal-input"
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Internal notes about this contact…"
                      rows={3}
                      style={{ resize: 'vertical', height: 72, lineHeight: 1.5 }}
                    />
                  </Field>
                </>
              )}

              {/* ── ADDRESS TAB ── */}
              {modalTab === 'address' && (
                <>
                  {/* Billing */}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>
                    Billing Address
                  </div>
                  <div className="modal-grid-2">
                    <Field label="Street">
                      <Input value={form.bill_street} onChange={v => set('bill_street', v)} placeholder="123 Main St" />
                    </Field>
                    <Field label="City">
                      <Input value={form.bill_city} onChange={v => set('bill_city', v)} placeholder="Auckland" />
                    </Field>
                    <Field label="Postcode">
                      <Input value={form.bill_postcode} onChange={v => set('bill_postcode', v)} placeholder="1010" />
                    </Field>
                    <Field label="Country">
                      <Select
                        value={form.bill_country}
                        onChange={v => set('bill_country', v)}
                        options={[
                          { value: 'New Zealand', label: 'New Zealand' },
                          { value: 'Australia', label: 'Australia' },
                          { value: 'United Kingdom', label: 'United Kingdom' },
                          { value: 'United States', label: 'United States' },
                          { value: 'Other', label: 'Other' },
                        ]}
                      />
                    </Field>
                  </div>

                  {/* Same address toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={sameAddress}
                      onChange={e => setSameAddress(e.target.checked)}
                      style={{ accentColor: 'var(--teal)', width: 14, height: 14 }}
                    />
                    Shipping address same as billing
                  </label>

                  {/* Shipping */}
                  {!sameAddress && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-400)', fontFamily: 'var(--font-ui)', marginBottom: 8, marginTop: 4 }}>
                        Shipping Address
                      </div>
                      <div className="modal-grid-2">
                        <Field label="Attention / Name">
                          <Input value={form.ship_name} onChange={v => set('ship_name', v)} placeholder="Receiving team" />
                        </Field>
                        <Field label="Street">
                          <Input value={form.ship_street} onChange={v => set('ship_street', v)} placeholder="123 Main St" />
                        </Field>
                        <Field label="City">
                          <Input value={form.ship_city} onChange={v => set('ship_city', v)} placeholder="Auckland" />
                        </Field>
                        <Field label="Postcode">
                          <Input value={form.ship_postcode} onChange={v => set('ship_postcode', v)} placeholder="1010" />
                        </Field>
                        <Field label="Country">
                          <Select
                            value={form.ship_country}
                            onChange={v => set('ship_country', v)}
                            options={[
                              { value: 'New Zealand', label: 'New Zealand' },
                              { value: 'Australia', label: 'Australia' },
                              { value: 'United Kingdom', label: 'United Kingdom' },
                              { value: 'United States', label: 'United States' },
                              { value: 'Other', label: 'Other' },
                            ]}
                          />
                        </Field>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── FINANCIAL TAB ── */}
              {modalTab === 'financial' && (
                <>
                  <div className="modal-grid-3">
                    <Field label="Currency">
                      <Select
                        value={form.currency}
                        onChange={v => set('currency', v)}
                        options={[
                          { value: 'NZD', label: 'NZD' },
                          { value: 'AUD', label: 'AUD' },
                          { value: 'USD', label: 'USD' },
                          { value: 'GBP', label: 'GBP' },
                          { value: 'EUR', label: 'EUR' },
                        ]}
                      />
                    </Field>
                    <Field label="Price Tier">
                      <Select
                        value={form.tier}
                        onChange={v => set('tier', v)}
                        options={[
                          { value: 'Retail', label: 'Retail' },
                          { value: 'Wholesale', label: 'Wholesale' },
                          { value: 'VIP', label: 'VIP' },
                        ]}
                      />
                    </Field>
                    <Field label="Payment Terms">
                      <Select
                        value={form.terms}
                        onChange={v => set('terms', v)}
                        options={[
                          { value: 'Net 7', label: 'Net 7' },
                          { value: 'Net 14', label: 'Net 14' },
                          { value: 'Net 30', label: 'Net 30' },
                          { value: 'Net 60', label: 'Net 60' },
                          { value: 'COD', label: 'COD' },
                          { value: 'Prepaid', label: 'Prepaid' },
                        ]}
                      />
                    </Field>
                    <Field label="Tax Rate">
                      <Select
                        value={form.tax_rate}
                        onChange={v => set('tax_rate', v)}
                        options={[
                          { value: '', label: 'None' },
                          { value: '0% — Tax Exempt', label: '0% — Tax Exempt' },
                          { value: '10% — GST (AU)', label: '10% — GST (AU)' },
                          { value: '15% — GST (NZ)', label: '15% — GST (NZ)' },
                          { value: '20% — VAT (UK)', label: '20% — VAT (UK)' },
                        ]}
                      />
                    </Field>
                    <Field label="Credit Limit">
                      <Input value={form.credit_limit} onChange={v => set('credit_limit', v)} placeholder="0" type="number" />
                    </Field>
                    <Field label="Discount Type">
                      <Select
                        value={form.disc_type}
                        onChange={v => set('disc_type', v)}
                        options={[
                          { value: 'percent', label: 'Percent (%)' },
                          { value: 'dollar', label: 'Dollar ($)' },
                        ]}
                      />
                    </Field>
                    <Field label={`Discount ${form.disc_type === 'percent' ? '(%)' : '($)'}`}>
                      <Input value={form.disc_value} onChange={v => set('disc_value', v)} placeholder="0" type="number" />
                    </Field>
                  </div>
                </>
              )}

              {error && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#B91C1C' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
