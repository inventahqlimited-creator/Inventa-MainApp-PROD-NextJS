'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Contact = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  bill_street: string | null
  bill_city: string | null
  bill_postcode: string | null
  bill_country: string | null
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

type AdditionalAddress = {
  id?: string
  label: string
  contact_name: string
  email: string
  phone: string
  street: string
  city: string
  postcode: string
  country: string
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

const AVATAR_COLORS = ['#0D9488','#0891B2','#7C3AED','#DB2777','#D97706','#059669','#DC2626','#2563EB']

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function typeBadge(type: string) {
  if (type === 'customer') return <span className="badge badge-customer">Customer</span>
  if (type === 'supplier') return <span className="badge badge-supplier">Supplier</span>
  return <span className="badge badge-both">Both</span>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="modal-field">
      <label className="modal-label">{label}{required && <span className="req"> *</span>}</label>
      {children}
    </div>
  )
}

function MInput({ value, onChange, placeholder, type = 'text', disabled }: { value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return <input className="modal-input" type={type} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled} style={disabled ? { opacity: 0.7, cursor: 'default' } : {}} />
}

function MSelect({ value, onChange, options, disabled }: { value: string; onChange?: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <select className="modal-input" value={value} onChange={e => onChange?.(e.target.value)} disabled={disabled} style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1 }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}


const COLS = [
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'currency', label: 'Currency' },
  { key: 'tier', label: 'Price Tier' },
  { key: 'terms', label: 'Payment Terms' },
  { key: 'taxrate', label: 'Tax Rate' },
  { key: 'taxnum', label: 'NZBN / ABN' },
  { key: 'address', label: 'Billing Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'balance', label: 'Balance Owing' },
  { key: 'credit', label: 'Credit Limit' },
  { key: 'discount', label: 'Discount' },
]

const DEFAULT_VISIBLE = new Set(['type','status','currency','tier','terms','taxrate','address','phone','email','balance'])

type ContactPermissions = {
  create_contacts: boolean
  edit_contacts: boolean
  export_contacts: boolean
  import_contacts: boolean
}

export default function ContactsTable({
  contacts: initialContacts,
  orgId,
  isAdmin,
  permissions = { create_contacts: true, edit_contacts: true, export_contacts: true, import_contacts: true },
  priceLevels = [],
  currencies = [],
  baseCurrency = 'NZD',
  taxRates = [],
  locations = [],
  customFields = [],
  customLists = [],
}: {
  contacts: Contact[]
  orgId: string
  isAdmin: boolean
  permissions?: ContactPermissions
  priceLevels?: { id: string; name: string; is_default: boolean }[]
  currencies?: { id: string; code: string; name: string; symbol: string | null }[]
  baseCurrency?: string
  taxRates?: { id: string; name: string; rate: number }[]
  locations?: { id: string; name: string; active: boolean }[]
  customFields?: { id: string; name: string; field_type: string }[]
  customLists?: { id: string; name: string; options: { id: string; value: string }[] }[]
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [contacts, setContacts] = useState(initialContacts)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tab, setTab] = useState<'all' | 'customer' | 'supplier'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('contacts_visible_cols')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {}
    return DEFAULT_VISIBLE
  })

  // Dropdowns
  const [typeOpen, setTypeOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)

  // Export / Import modals
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Advanced filters
  const [advTerms, setAdvTerms] = useState('')
  const [advTaxRate, setAdvTaxRate] = useState('')
  const [advCity, setAdvCity] = useState('')
  const [advCountry, setAdvCountry] = useState('')
  const [advCurrency, setAdvCurrency] = useState('')
  const [advLocation, setAdvLocation] = useState('')
  const [advCustom, setAdvCustom] = useState<Record<string, string>>({})

  // Modal
  const [modal, setModal] = useState<'closed' | 'view' | 'add' | 'edit'>('closed')
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM)
  const [modalTab, setModalTab] = useState<'details' | 'address' | 'custom' | 'orders'>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sameAddress, setSameAddress] = useState(false)
  const [additionalAddresses, setAdditionalAddresses] = useState<AdditionalAddress[]>([])
  const [orders, setOrders] = useState<Record<string, unknown>[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})

  // Derived option arrays from settings props
  const currencyOptions = useMemo(() => {
    const codes = [baseCurrency, ...currencies.map(c => c.code).filter(c => c !== baseCurrency)]
    return codes.map(c => ({ value: c, label: c }))
  }, [baseCurrency, currencies])

  const tierOptions = useMemo(() =>
    priceLevels.length > 0
      ? priceLevels.map(p => ({ value: p.name, label: p.name }))
      : [{ value: 'Retail', label: 'Retail' }]
  , [priceLevels])

  const taxRateOptions = useMemo(() => [
    { value: '', label: 'None' },
    ...taxRates.map(t => ({ value: `${t.rate}% — ${t.name}`, label: `${t.rate}% — ${t.name}` })),
  ], [taxRates])

  // Default values derived from settings
  const defaultCurrency = baseCurrency
  const defaultTier = priceLevels.find(p => p.is_default)?.name ?? priceLevels[0]?.name ?? 'Retail'

  // Auto-open modal when ?new=1 param is present (runs on mount AND when already on page)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openAdd()
      const url = new URL(window.location.href)
      url.searchParams.delete('new')
      window.history.replaceState({}, '', url.toString())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function set(field: keyof ModalForm, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, currency: defaultCurrency, tier: defaultTier, tax_rate: taxRateOptions.length > 1 ? taxRateOptions[1].value : '' })
    setActiveContact(null)
    setModal('add')
    setModalTab('details')
    setError(null)
    setSameAddress(false)
    setAdditionalAddresses([])
    setCustomFieldValues({})
  }

  function openEdit(c: Contact) {
    setForm({
      name: c.name, type: c.type,
      email: c.email ?? '', phone: c.phone ?? '', website: c.website ?? '',
      tax_number: c.tax_number ?? '', currency: c.currency ?? 'NZD',
      tier: c.tier ?? 'Retail', terms: c.terms ?? 'Net 30', tax_rate: c.tax_rate ?? '',
      credit_limit: String(c.credit_limit ?? 0), disc_type: c.disc_type ?? 'percent',
      disc_value: String(c.disc_value ?? 0),
      bill_street: c.bill_street ?? '', bill_city: c.bill_city ?? '',
      bill_postcode: c.bill_postcode ?? '', bill_country: c.bill_country ?? 'New Zealand',
      ship_name: c.ship_name ?? '', ship_street: c.ship_street ?? '',
      ship_city: c.ship_city ?? '', ship_postcode: c.ship_postcode ?? '',
      ship_country: c.ship_country ?? 'New Zealand',
      notes: c.notes ?? '', is_active: c.is_active ?? true,
    })
    setActiveContact(c)
    setModal('edit')
    setModalTab('details')
    setError(null)
    setSameAddress(false)
    loadAdditionalAddresses(c.id)
    const existing = (c as Record<string, unknown>).custom_fields as Record<string, string> | null
    setCustomFieldValues(existing ?? {})
  }

  function openView(c: Contact) {
    setActiveContact(c)
    setModal('view')
    setModalTab('details')
    setError(null)
    setOrders([])
    const existing = (c as Record<string, unknown>).custom_fields as Record<string, string> | null
    setCustomFieldValues(existing ?? {})
    loadAdditionalAddresses(c.id)
  }

  function closeModal() {
    setModal('closed')
    setActiveContact(null)
    setError(null)
    setAdditionalAddresses([])
    setOrders([])
    setCustomFieldValues({})
  }

  async function loadAdditionalAddresses(contactId: string) {
    const res = await fetch(`/api/org/contacts/${contactId}/addresses`)
    if (res.ok) {
      const data = await res.json()
      setAdditionalAddresses(data)
    }
  }

  async function loadOrders(contact: Contact) {
    setOrdersLoading(true)
    const endpoint = contact.type === 'supplier'
      ? `/api/org/contacts/${contact.id}/purchase-orders`
      : `/api/org/contacts/${contact.id}/sales-orders`
    const res = await fetch(endpoint)
    if (res.ok) setOrders(await res.json())
    setOrdersLoading(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Contact name is required.'); return }

    // Permission guards (defence-in-depth)
    if (modal === 'add' && !permissions.create_contacts) {
      setError('You do not have permission to create contacts.')
      return
    }
    if (modal === 'edit' && !permissions.edit_contacts) {
      setError('You do not have permission to edit contacts.')
      return
    }

    // Duplicate email check (client-side across loaded contacts)
    if (form.email.trim()) {
      const emailLower = form.email.trim().toLowerCase()
      const duplicate = contacts.find(c =>
        c.email?.toLowerCase() === emailLower &&
        (modal !== 'edit' || c.id !== activeContact?.id)
      )
      if (duplicate) {
        setError(`This email is already used by "${duplicate.name}". Each contact must have a unique email address.`)
        return
      }
    }


    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(), type: form.type,
      email: form.email || null, phone: form.phone || null,
      website: form.website || null, tax_number: form.tax_number || null,
      currency: form.currency, tier: form.tier, terms: form.terms,
      tax_rate: form.tax_rate || null,
      credit_limit: parseFloat(form.credit_limit) || 0,
      disc_type: form.disc_type, disc_value: parseFloat(form.disc_value) || 0,
      bill_street: form.bill_street || null, bill_city: form.bill_city || null,
      bill_postcode: form.bill_postcode || null, bill_country: form.bill_country || null,
      ship_name: form.ship_name || null,
      ship_street: sameAddress ? form.bill_street || null : form.ship_street || null,
      ship_city: sameAddress ? form.bill_city || null : form.ship_city || null,
      ship_postcode: sameAddress ? form.bill_postcode || null : form.ship_postcode || null,
      ship_country: sameAddress ? form.bill_country || null : form.ship_country || null,
      notes: form.notes || null, is_active: form.is_active,
      status: form.is_active ? 'active' : 'inactive',
      custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : null,
    }

    const isEdit = modal === 'edit' && activeContact
    const url = isEdit ? `/api/org/contacts/${activeContact.id}` : '/api/org/contacts'
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }

    const contactId: string = isEdit ? activeContact.id : data.id

    const updatedContact = isEdit
      ? { ...activeContact, ...payload } as Contact
      : { ...payload, id: contactId, balance_owing: 0 } as Contact

    if (isEdit) {
      setContacts(prev => prev.map(c => c.id === activeContact.id ? updatedContact : c))
    } else {
      setContacts(prev => [...prev, updatedContact])
    }

    // Save additional addresses — runs for both new and edit
    for (const addr of additionalAddresses) {
      if (addr.id) {
        // Existing address — update
        await fetch(`/api/org/contacts/${contactId}/addresses/${addr.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addr),
        })
      } else {
        // New address — create
        await fetch(`/api/org/contacts/${contactId}/addresses`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addr),
        })
      }
    }

    if (isEdit) {
      openView(updatedContact)
    } else {
      closeModal()
    }
  }

  async function bulkAction(action: 'active' | 'inactive') {
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(id =>
      fetch(`/api/org/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: action === 'active', status: action }),
      })
    ))
    setContacts(prev => prev.map(c =>
      selectedIds.has(c.id) ? { ...c, is_active: action === 'active', status: action } : c
    ))
    setSelectedIds(new Set())
  }

  // Filtering
  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (!showInactive && !c.is_active) return false
      if (tab !== 'all' && c.type !== tab) return false
      if (typeFilter && c.type !== typeFilter.toLowerCase()) return false
      if (advTerms && c.terms !== advTerms) return false
      if (advTaxRate && c.tax_rate !== advTaxRate) return false
      if (advCity && !(c.bill_city ?? '').toLowerCase().includes(advCity.toLowerCase())) return false
      if (advCountry && !(c.bill_country ?? '').toLowerCase().includes(advCountry.toLowerCase())) return false
      if (advCurrency && c.currency !== advCurrency) return false
      if (advLocation && (c as Record<string, unknown>).default_location !== advLocation) return false
      for (const [fieldId, val] of Object.entries(advCustom)) {
        if (!val) continue
        const cf = (c as Record<string, unknown>).custom_fields as Record<string, string> | null
        if (!cf || cf[fieldId] !== val) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.bill_city ?? '').toLowerCase().includes(q) ||
          (c.tax_number ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [contacts, search, typeFilter, tab, showInactive, advTerms, advTaxRate, advCity, advCountry, advCurrency, advLocation, advCustom])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const counts = useMemo(() => ({
    all: contacts.filter(c => showInactive || c.is_active).length,
    customer: contacts.filter(c => c.type === 'customer' && (showInactive || c.is_active)).length,
    supplier: contacts.filter(c => c.type === 'supplier' && (showInactive || c.is_active)).length,
  }), [contacts, showInactive])

  const allPageSelected = paginated.length > 0 && paginated.every(c => selectedIds.has(c.id))

  function toggleAll(checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      paginated.forEach(c => checked ? next.add(c.id) : next.delete(c.id))
      return next
    })
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleCol(key: string, on: boolean) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      on ? next.add(key) : next.delete(key)
      try { localStorage.setItem('contacts_visible_cols', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function clearAdvFilter() {
    setAdvTerms(''); setAdvTaxRate(''); setAdvCity(''); setAdvCountry('')
    setAdvCurrency(''); setAdvLocation(''); setAdvCustom({})
  }

  const hasAdvFilter = !!(advTerms || advTaxRate || advCity || advCountry || advCurrency || advLocation || Object.values(advCustom).some(Boolean))

  const v = visibleCols

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setTypeOpen(false); setColOpen(false); setActionsOpen(false) }}>

      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Contacts</div>
            <div className="page-subtitle">Customers &amp; suppliers in one place</div>
          </div>
          <div className="page-header-actions">
            {(permissions.export_contacts || permissions.import_contacts) && (
              <div style={{ position: 'relative' }}>
                <button className="btn btn-outline" onClick={e => { e.stopPropagation(); setActionsOpen(o => !o) }}>
                  Actions
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {actionsOpen && (
                  <div className="inv-dropdown" style={{ display: 'block', minWidth: 190, padding: 6 }} onClick={e => e.stopPropagation()}>
                    {permissions.export_contacts && (
                      <div className="dd-item" onClick={() => { setActionsOpen(false); setShowExport(true) }}>
                        <div className="dd-icon-wrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
                        Export Contacts
                      </div>
                    )}
                    {permissions.import_contacts && (
                      <div className="dd-item" onClick={() => { setActionsOpen(false); setShowImport(true) }}>
                        <div className="dd-icon-wrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                        Import Contacts
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {permissions.create_contacts && (
              <button className="btn btn-primary" onClick={openAdd}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Contact
              </button>
            )}
          </div>
        </div>
        <div className="tab-bar">
          {(['all', 'customer', 'supplier'] as const).map(t => (
            <div key={t} className={`tab-item${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); setTypeFilter(''); setPage(1) }}>
              {t === 'all' ? 'All' : t === 'customer' ? 'Customers' : 'Suppliers'}
              <span className="tab-count">{counts[t]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search contacts…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        {/* Currency filter */}
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${advCurrency ? ' active-filter' : ''}`} onClick={() => setTypeOpen(o => !o)}>
            <span>{advCurrency || 'All Currencies'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }}>
              <div className="col-dropdown-title">Currency</div>
              {[{ value: '', label: 'All Currencies' }, ...currencyOptions].map(o => (
                <div key={o.value} className={`fp-item${advCurrency === o.value ? ' active' : ''}`} onClick={() => { setAdvCurrency(o.value); setPage(1); setTypeOpen(false) }}>{o.label}</div>
              ))}
            </div>
          )}
        </div>

        {/* Advanced filter button */}
        <button className={`filter-btn${advOpen || hasAdvFilter ? ' active' : ''}`} onClick={() => setAdvOpen(o => !o)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Advanced{hasAdvFilter ? ' •' : ''}
        </button>

        {/* Show inactive */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showInactive} onChange={e => { setShowInactive(e.target.checked); setPage(1) }} style={{ accentColor: 'var(--teal)', cursor: 'pointer', width: 14, height: 14 }} />
          Show inactive
        </label>

        <div className="filter-spacer" />

        {/* Column selector */}
        <div style={{ position: 'relative' }}>
          <button className="col-selector-btn" onClick={() => setColOpen(o => !o)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Columns
          </button>
          {colOpen && (
            <div className="inv-dropdown col-dropdown" style={{ display: 'block' }}>
              <div className="col-dropdown-title">Show / Hide Columns</div>
              {COLS.map(col => (
                <label key={col.key} className="col-check-item">
                  <input type="checkbox" checked={v.has(col.key)} onChange={e => toggleCol(col.key, e.target.checked)} style={{ accentColor: 'var(--teal)', width: 14, height: 14, cursor: 'pointer' }} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advanced filter panel */}
      {advOpen && (
        <div className="adv-filter-panel open">
          <div className="adv-filter-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Advanced Filters</span>
            <button onClick={() => setAdvOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Close
            </button>
          </div>
          <div className="adv-filter-grid">
            <div className="adv-field">
              <label>Payment Terms</label>
              <select className="adv-input" value={advTerms} onChange={e => setAdvTerms(e.target.value)} style={{ cursor: 'pointer' }}>
                <option value="">Any</option>
                {['Net 7','Net 14','Net 30','Net 60','COD','Prepaid'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="adv-field">
              <label>Tax Rate</label>
              <select className="adv-input" value={advTaxRate} onChange={e => setAdvTaxRate(e.target.value)} style={{ cursor: 'pointer' }}>
                <option value="">Any</option>
                {taxRateOptions.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="adv-field">
              <label>Default Location</label>
              <select className="adv-input" value={advLocation} onChange={e => setAdvLocation(e.target.value)} style={{ cursor: 'pointer' }}>
                <option value="">Any</option>
                {locations.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="adv-field">
              <label>City</label>
              <input className="adv-input" placeholder="e.g. Auckland" value={advCity} onChange={e => setAdvCity(e.target.value)} />
            </div>
            <div className="adv-field">
              <label>Country</label>
              <input className="adv-input" placeholder="e.g. New Zealand" value={advCountry} onChange={e => setAdvCountry(e.target.value)} />
            </div>
            {customLists.map(cl => (
              <div key={cl.id} className="adv-field">
                <label>{cl.name}</label>
                <select className="adv-input" value={advCustom[cl.id] ?? ''} onChange={e => setAdvCustom(prev => ({ ...prev, [cl.id]: e.target.value }))} style={{ cursor: 'pointer' }}>
                  <option value="">Any</option>
                  {cl.options.map(o => <option key={o.id} value={o.value}>{o.value}</option>)}
                </select>
              </div>
            ))}
            {customFields.filter(f => f.field_type === 'text' || f.field_type === 'number').map(cf => (
              <div key={cf.id} className="adv-field">
                <label>{cf.name}</label>
                <input className="adv-input" placeholder={`Filter by ${cf.name}`} value={advCustom[cf.id] ?? ''} onChange={e => setAdvCustom(prev => ({ ...prev, [cf.id]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="adv-filter-actions">
            <button className="btn-sm btn-sm-primary" onClick={() => setAdvOpen(false)}>Apply</button>
            <button className="btn-sm btn-sm-ghost" onClick={clearAdvFilter}>Clear all</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <div className="table-toolbar">
          {selectedIds.size > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{selectedIds.size} selected</span>
              <div style={{ width: 1, height: 18, background: 'var(--gray-200)', margin: '0 4px' }} />
              <button className="btn-sm btn-sm-primary" onClick={() => bulkAction('active')}>Set Active</button>
              <button className="btn-sm btn-sm-ghost" onClick={() => bulkAction('inactive')} style={{ color: 'var(--gray-400)' }}>Set Inactive</button>
              <button className="btn-sm btn-sm-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelectedIds(new Set())}>✕ Clear</button>
            </div>
          ) : (
            <span className="table-count"><strong>{filtered.length}</strong> contacts</span>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={e => toggleAll(e.target.checked)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                </th>
                <th className="sortable">Contact Name</th>
                {v.has('type') && <th>Type</th>}
                {v.has('status') && <th>Status</th>}
                {v.has('currency') && <th>Currency</th>}
                {v.has('tier') && <th>Price Tier</th>}
                {v.has('terms') && <th>Payment Terms</th>}
                {v.has('taxrate') && <th>Tax Rate</th>}
                {v.has('taxnum') && <th>NZBN / ABN</th>}
                {v.has('address') && <th>Billing Address</th>}
                {v.has('phone') && <th>Phone</th>}
                {v.has('email') && <th>Email</th>}
                {v.has('balance') && <th style={{ textAlign: 'right' }}>Balance Owing</th>}
                {v.has('credit') && <th style={{ textAlign: 'right' }}>Credit Limit</th>}
                {v.has('discount') && <th>Discount</th>}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No contacts match your search.' : 'No contacts yet. Add one to get started.'}
                  </td>
                </tr>
              )}
              {paginated.map(c => (
                <tr key={c.id} onClick={() => openView(c)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                  </td>
                  <td>
                    <div className="contact-cell">
                      <div className="contact-avatar" style={{ background: avatarColor(c.name), color: '#fff' }}>{getInitials(c.name)}</div>
                      <div>
                        <div className="contact-name">{c.name}</div>
                        {v.has('taxnum') && c.tax_number && <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace' }}>{c.tax_number}</div>}
                      </div>
                    </div>
                  </td>
                  {v.has('type') && <td>{typeBadge(c.type)}</td>}
                  {v.has('status') && <td>{c.is_active ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46' }}>Active</span> : <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>Inactive</span>}</td>}
                  {v.has('currency') && <td className="td-muted">{c.currency ?? '—'}</td>}
                  {v.has('tier') && <td className="td-muted">{c.tier ?? '—'}</td>}
                  {v.has('terms') && <td className="td-muted">{c.terms ?? '—'}</td>}
                  {v.has('taxrate') && <td className="td-muted">{c.tax_rate ?? '—'}</td>}
                  {v.has('taxnum') && <td className="td-mono">{c.tax_number ?? '—'}</td>}
                  {v.has('address') && <td className="td-muted">{[c.bill_city, c.bill_country].filter(Boolean).join(', ') || '—'}</td>}
                  {v.has('phone') && <td className="td-mono">{c.phone ?? '—'}</td>}
                  {v.has('email') && <td className="td-muted">{c.email ?? '—'}</td>}
                  {v.has('balance') && <td style={{ textAlign: 'right' }} className="td-muted">{c.balance_owing ? `$${Number(c.balance_owing).toFixed(2)}` : '—'}</td>}
                  {v.has('credit') && <td style={{ textAlign: 'right' }} className="td-muted">{c.credit_limit ? `$${Number(c.credit_limit).toFixed(2)}` : '—'}</td>}
                  {v.has('discount') && <td className="td-muted">{c.disc_value ? `${c.disc_value}${c.disc_type === 'percent' ? '%' : '$'}` : '—'}</td>}
                  <td>
                    <div className="row-actions">
                      {permissions.edit_contacts && (
                      <button className="row-action-btn" onClick={e => { e.stopPropagation(); openEdit(c) }} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      )}
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
      {modal !== 'closed' && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal-box" style={{ maxWidth: 720 }}>

            {/* Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {modal === 'view' && activeContact && (
                  <div className="contact-avatar" style={{ background: avatarColor(activeContact.name), color: '#fff', width: 40, height: 40, borderRadius: 12, fontSize: 14 }}>
                    {getInitials(activeContact.name)}
                  </div>
                )}
                <div>
                  <div className="modal-title">
                    {modal === 'view' ? activeContact?.name : modal === 'edit' ? 'Edit Contact' : 'New Contact'}
                  </div>
                  <div className="modal-subtitle">
                    {modal === 'view' && activeContact ? `${activeContact.type.charAt(0).toUpperCase() + activeContact.type.slice(1)} · ${activeContact.is_active ? 'Active' : 'Inactive'}` : modal === 'edit' ? 'Update contact details' : 'Add a new supplier or customer'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {modal === 'view' && permissions.edit_contacts && (
                  <button className="btn btn-outline" style={{ height: 34 }} onClick={() => activeContact && openEdit(activeContact)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Contact
                  </button>
                )}
                {(modal === 'add' || modal === 'edit') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--gray-400)' }}>
                    <span>{form.is_active ? 'Active' : 'Inactive'}</span>
                    <button className="status-toggle" data-active={String(form.is_active)} onClick={() => set('is_active', !form.is_active)} type="button">
                      <div className="status-toggle-knob" />
                    </button>
                  </div>
                )}
                <button className="modal-close" onClick={closeModal}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="modal-tab-bar">
              {([
                { key: 'details', label: 'Details' },
                { key: 'address', label: 'Addresses' },
                { key: 'custom', label: 'Custom Fields' },
                ...(modal === 'view' ? [{ key: 'orders', label: 'Orders' }] : []),
              ] as { key: typeof modalTab; label: string }[]).map(t => (
                <div
                  key={t.key}
                  className={`modal-tab${modalTab === t.key ? ' active' : ''}`}
                  onClick={() => {
                    setModalTab(t.key)
                    if (t.key === 'orders' && modal === 'view' && activeContact && orders.length === 0) {
                      loadOrders(activeContact)
                    }
                    if (t.key === 'address' && modal === 'edit' && activeContact) {
                      loadAdditionalAddresses(activeContact.id)
                    }
                  }}
                >
                  {t.label}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="modal-body">

              {/* ── DETAILS TAB ── */}
              {modalTab === 'details' && (
                <>
                  {/* Name + Type row */}
                  <div className="modal-grid-2">
                    <Field label="Contact Name" required>
                      <MInput value={modal === 'view' ? (activeContact?.name ?? '') : form.name} onChange={v => set('name', v)} placeholder="e.g. Acme Supplies Ltd" disabled={modal === 'view'} />
                    </Field>
                    <Field label="Type" required>
                      {modal === 'view' ? (
                        <MInput value={activeContact?.type ?? ''} disabled />
                      ) : (
                        <div className="modal-seg">
                          {['supplier', 'customer'].map(t => (
                            <button key={t} type="button" className={`seg-btn${form.type === t ? ' active' : ''}`} onClick={() => set('type', t)}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                      )}
                    </Field>
                  </div>

                  <div className="modal-grid-2">
                    <Field label="Email">
                      <MInput value={modal === 'view' ? (activeContact?.email ?? '') : form.email} onChange={v => set('email', v)} placeholder="orders@example.com" type="email" disabled={modal === 'view'} />
                    </Field>
                    <Field label="Phone">
                      <MInput value={modal === 'view' ? (activeContact?.phone ?? '') : form.phone} onChange={v => set('phone', v)} placeholder="+64 9 000 0000" disabled={modal === 'view'} />
                    </Field>
                    <Field label="Website">
                      <MInput value={modal === 'view' ? (activeContact?.website ?? '') : form.website} onChange={v => set('website', v)} placeholder="www.example.com" disabled={modal === 'view'} />
                    </Field>
                    <Field label="NZBN / ABN">
                      <MInput value={modal === 'view' ? (activeContact?.tax_number ?? '') : form.tax_number} onChange={v => set('tax_number', v)} placeholder="e.g. 9429000000000" disabled={modal === 'view'} />
                    </Field>
                  </div>

                  {/* Financial fields */}
                  <div style={{ height: 1, background: 'var(--gray-100)', margin: '4px 0' }} />
                  <div className="modal-grid-3">
                    <Field label="Currency">
                      <MSelect value={modal === 'view' ? (activeContact?.currency ?? defaultCurrency) : form.currency} onChange={v => set('currency', v)} options={currencyOptions} disabled={modal === 'view'} />
                    </Field>
                    <Field label="Price Tier">
                      <MSelect value={modal === 'view' ? (activeContact?.tier ?? defaultTier) : form.tier} onChange={v => set('tier', v)} options={tierOptions} disabled={modal === 'view'} />
                    </Field>
                    <Field label="Payment Terms">
                      <MSelect value={modal === 'view' ? (activeContact?.terms ?? 'Net 30') : form.terms} onChange={v => set('terms', v)} options={['Net 7','Net 14','Net 30','Net 60','COD','Prepaid'].map(t=>({value:t,label:t}))} disabled={modal === 'view'} />
                    </Field>
                    <Field label="Tax Rate">
                      <MSelect value={modal === 'view' ? (activeContact?.tax_rate ?? '') : form.tax_rate} onChange={v => set('tax_rate', v)} options={taxRateOptions} disabled={modal === 'view'} />
                    </Field>
                    <Field label="Credit Limit">
                      <MInput value={modal === 'view' ? String(activeContact?.credit_limit ?? 0) : form.credit_limit} onChange={v => set('credit_limit', v)} type="number" disabled={modal === 'view'} />
                    </Field>
                    <Field label="Discount">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <MSelect value={modal === 'view' ? (activeContact?.disc_type ?? 'percent') : form.disc_type} onChange={v => set('disc_type', v)} options={[{value:'percent',label:'%'},{value:'dollar',label:'$'}]} disabled={modal === 'view'} />
                        <MInput value={modal === 'view' ? String(activeContact?.disc_value ?? 0) : form.disc_value} onChange={v => set('disc_value', v)} type="number" disabled={modal === 'view'} />
                      </div>
                    </Field>
                  </div>

                  <Field label="Notes">
                    <textarea
                      className="modal-input"
                      value={modal === 'view' ? (activeContact?.notes ?? '') : form.notes}
                      onChange={e => set('notes', e.target.value)}
                      placeholder="Internal notes about this contact…"
                      rows={3}
                      disabled={modal === 'view'}
                      style={{ resize: 'vertical', height: 72, lineHeight: 1.5, opacity: modal === 'view' ? 0.7 : 1 }}
                    />
                  </Field>
                </>
              )}

              {/* ── ADDRESS TAB ── */}
              {modalTab === 'address' && (
                <>
                  {/* Billing */}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', marginBottom: 8 }}>Billing Address</div>
                  <div className="modal-grid-2">
                    <Field label="Street"><MInput value={modal === 'view' ? (activeContact?.bill_street ?? '') : form.bill_street} onChange={v => set('bill_street', v)} placeholder="123 Main St" disabled={modal === 'view'} /></Field>
                    <Field label="City"><MInput value={modal === 'view' ? (activeContact?.bill_city ?? '') : form.bill_city} onChange={v => set('bill_city', v)} placeholder="Auckland" disabled={modal === 'view'} /></Field>
                    <Field label="Postcode"><MInput value={modal === 'view' ? (activeContact?.bill_postcode ?? '') : form.bill_postcode} onChange={v => set('bill_postcode', v)} placeholder="1010" disabled={modal === 'view'} /></Field>
                    <Field label="Country"><MInput value={modal === 'view' ? (activeContact?.bill_country ?? '') : form.bill_country} onChange={v => set('bill_country', v)} placeholder="e.g. New Zealand" disabled={modal === 'view'} /></Field>
                  </div>

                  {modal !== 'view' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={sameAddress} onChange={e => setSameAddress(e.target.checked)} style={{ accentColor: 'var(--teal)', width: 14, height: 14 }} />
                      Shipping address same as billing
                    </label>
                  )}

                  {/* Shipping */}
                  {!sameAddress && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', margin: '12px 0 8px' }}>Shipping Address</div>
                      <div className="modal-grid-2">
                        <Field label="Attention / Name"><MInput value={modal === 'view' ? (activeContact?.ship_name ?? '') : form.ship_name} onChange={v => set('ship_name', v)} placeholder="Receiving team" disabled={modal === 'view'} /></Field>
                        <Field label="Street"><MInput value={modal === 'view' ? (activeContact?.ship_street ?? '') : form.ship_street} onChange={v => set('ship_street', v)} placeholder="123 Main St" disabled={modal === 'view'} /></Field>
                        <Field label="City"><MInput value={modal === 'view' ? (activeContact?.ship_city ?? '') : form.ship_city} onChange={v => set('ship_city', v)} placeholder="Auckland" disabled={modal === 'view'} /></Field>
                        <Field label="Postcode"><MInput value={modal === 'view' ? (activeContact?.ship_postcode ?? '') : form.ship_postcode} onChange={v => set('ship_postcode', v)} placeholder="1010" disabled={modal === 'view'} /></Field>
                        <Field label="Country"><MInput value={modal === 'view' ? (activeContact?.ship_country ?? '') : form.ship_country} onChange={v => set('ship_country', v)} placeholder="e.g. New Zealand" disabled={modal === 'view'} /></Field>
                      </div>
                    </>
                  )}

                  {/* Additional addresses */}
                  {additionalAddresses.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--gray-400)', margin: '12px 0 8px' }}>Additional Addresses</div>
                      {additionalAddresses.map((addr, idx) => (
                        <div key={idx} style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <input
                              className="modal-input"
                              value={addr.label}
                              onChange={e => { const a = [...additionalAddresses]; a[idx].label = e.target.value; setAdditionalAddresses(a) }}
                              style={{ width: 160, fontSize: 12.5, fontWeight: 600 }}
                              placeholder="Label (e.g. Warehouse)"
                              disabled={modal === 'view'}
                            />
                            {modal !== 'view' && (
                              <button onClick={() => setAdditionalAddresses(prev => prev.filter((_, i) => i !== idx))} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </div>
                          <div className="modal-grid-2">
                            <Field label="Contact Name">
                              <input className="modal-input" value={addr.contact_name} onChange={e => { const a = [...additionalAddresses]; a[idx].contact_name = e.target.value; setAdditionalAddresses(a) }} placeholder="e.g. Receiving Team" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                            <Field label="Email">
                              <input className="modal-input" type="email" value={addr.email} onChange={e => { const a = [...additionalAddresses]; a[idx].email = e.target.value; setAdditionalAddresses(a) }} placeholder="warehouse@example.com" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                            <Field label="Phone">
                              <input className="modal-input" value={addr.phone} onChange={e => { const a = [...additionalAddresses]; a[idx].phone = e.target.value; setAdditionalAddresses(a) }} placeholder="+64 9 000 0000" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                            <Field label="Street">
                              <input className="modal-input" value={addr.street} onChange={e => { const a = [...additionalAddresses]; a[idx].street = e.target.value; setAdditionalAddresses(a) }} placeholder="123 Main St" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                            <Field label="City">
                              <input className="modal-input" value={addr.city} onChange={e => { const a = [...additionalAddresses]; a[idx].city = e.target.value; setAdditionalAddresses(a) }} placeholder="Auckland" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                            <Field label="Postcode">
                              <input className="modal-input" value={addr.postcode} onChange={e => { const a = [...additionalAddresses]; a[idx].postcode = e.target.value; setAdditionalAddresses(a) }} placeholder="1010" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                            <Field label="Country">
                              <input className="modal-input" value={addr.country} onChange={e => { const a = [...additionalAddresses]; a[idx].country = e.target.value; setAdditionalAddresses(a) }} placeholder="e.g. New Zealand" disabled={modal === 'view'} style={{ opacity: modal === 'view' ? 0.7 : 1 }} />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {modal !== 'view' && (
                    <button
                      onClick={() => setAdditionalAddresses(prev => [...prev, { label: 'Address', contact_name: '', email: '', phone: '', street: '', city: '', postcode: '', country: 'New Zealand' }])}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'var(--white)', border: '1.5px dashed var(--gray-200)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: 'var(--gray-400)', cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'border-color var(--transition),color var(--transition)' }}
                      onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--teal)'; (e.currentTarget as HTMLElement).style.color = 'var(--teal)' }}
                      onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-200)'; (e.currentTarget as HTMLElement).style.color = 'var(--gray-400)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Address
                    </button>
                  )}
                </>
              )}

              {/* ── CUSTOM FIELDS TAB ── */}
              {modalTab === 'custom' && (
                <>
                  {customFields.length === 0 && customLists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.6 }}>
                        No custom fields or lists configured yet.<br />
                        Go to <strong style={{ color: 'var(--teal)' }}>Settings → Contacts</strong> to add some.
                      </div>
                    </div>
                  ) : (
                    <div className="modal-grid-2">
                      {customFields.map(cf => (
                        <Field key={cf.id} label={cf.name}>
                          {cf.field_type === 'boolean' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                              <button
                                className="status-toggle"
                                data-active={String(!!(customFieldValues[cf.id] === 'true'))}
                                onClick={() => modal !== 'view' && setCustomFieldValues(prev => ({ ...prev, [cf.id]: customFieldValues[cf.id] === 'true' ? 'false' : 'true' }))}
                                type="button"
                                disabled={modal === 'view'}
                              >
                                <div className="status-toggle-knob" />
                              </button>
                              <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>{customFieldValues[cf.id] === 'true' ? 'Yes' : 'No'}</span>
                            </div>
                          ) : (
                            <input
                              className="modal-input"
                              type={cf.field_type === 'number' ? 'number' : cf.field_type === 'date' ? 'date' : 'text'}
                              value={customFieldValues[cf.id] ?? ''}
                              onChange={e => setCustomFieldValues(prev => ({ ...prev, [cf.id]: e.target.value }))}
                              disabled={modal === 'view'}
                              style={{ opacity: modal === 'view' ? 0.7 : 1 }}
                            />
                          )}
                        </Field>
                      ))}
                      {customLists.map(cl => (
                        <Field key={cl.id} label={cl.name}>
                          <select
                            className="modal-input"
                            value={customFieldValues[cl.id] ?? ''}
                            onChange={e => setCustomFieldValues(prev => ({ ...prev, [cl.id]: e.target.value }))}
                            disabled={modal === 'view'}
                            style={{ cursor: modal === 'view' ? 'default' : 'pointer', opacity: modal === 'view' ? 0.7 : 1 }}
                          >
                            <option value="">— Select —</option>
                            {cl.options.map(o => <option key={o.id} value={o.value}>{o.value}</option>)}
                          </select>
                        </Field>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── ORDERS TAB ── */}
              {modalTab === 'orders' && (
                <div>
                  {ordersLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: 13 }}>Loading…</div>
                  ) : orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      No {activeContact?.type === 'supplier' ? 'purchase' : 'sales'} orders found.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--gray-50)' }}>
                          <th className="li-th">Order #</th>
                          <th className="li-th">Date</th>
                          <th className="li-th">Status</th>
                          <th className="li-th" style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o: Record<string, unknown>) => (
                          <tr key={o.id as string} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--slate)' }}>{(o.po_number ?? o.so_number ?? '—') as string}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--gray-400)' }}>{o.order_date ? new Date(o.order_date as string).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={{ padding: '10px 14px' }}><span className="badge badge-draft">{o.status as string}</span></td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--slate)', fontWeight: 600 }}>{o.total_amount ? `$${Number(o.total_amount).toFixed(2)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {error && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#B91C1C' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer">
              {modal === 'view' ? (
                <button className="btn btn-outline" onClick={closeModal}>Close</button>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Contact'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Export Modal ── */}
      {showExport && (
        <ExportModal
          contacts={contacts}
          customFields={customFields}
          customLists={customLists}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <ImportModal
          orgId={orgId}
          customFields={customFields}
          customLists={customLists}
          onImported={newContacts => setContacts(prev => [...prev, ...(newContacts as Contact[])])}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

// ── Export Modal ──────────────────────────────────────────────────────

function ExportModal({
  contacts,
  customFields,
  customLists,
  onClose,
}: {
  contacts: { id: string; name: string; type: string; email: string | null; phone: string | null; bill_street: string | null; bill_city: string | null; bill_postcode: string | null; bill_country: string | null; ship_name: string | null; ship_street: string | null; ship_city: string | null; ship_postcode: string | null; ship_country: string | null; currency: string | null; tier: string | null; terms: string | null; tax_rate: string | null; balance_owing: number | null; credit_limit: number | null; disc_type: string | null; disc_value: number | null; tax_number: string | null; website: string | null; notes: string | null; is_active: boolean | null; status: string | null }[]
  customFields: { id: string; name: string; field_type: string }[]
  customLists: { id: string; name: string; options: { id: string; value: string }[] }[]
  onClose: () => void
}) {
  const counts = {
    all: contacts.length,
    customer: contacts.filter(c => c.type === 'customer').length,
    supplier: contacts.filter(c => c.type === 'supplier').length,
  }

  function doExport(type: 'all' | 'customer' | 'supplier') {
    const rows = type === 'all' ? contacts : contacts.filter(c => c.type === type)

    const STANDARD_HEADERS = [
      'Name', 'Type', 'Email', 'Phone', 'Website', 'Tax Number',
      'Currency', 'Price Tier', 'Payment Terms', 'Tax Rate',
      'Credit Limit', 'Discount Type', 'Discount Value', 'Balance Owing',
      'Billing Street', 'Billing City', 'Billing Postcode', 'Billing Country',
      'Ship Name', 'Shipping Street', 'Shipping City', 'Shipping Postcode', 'Shipping Country',
      'Status', 'Notes',
    ]
    const cfHeaders = customFields.map(f => f.name)
    const clHeaders = customLists.map(l => l.name)
    const headers = [...STANDARD_HEADERS, ...cfHeaders, ...clHeaders]

    const escapeCSV = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }

    const lines = [
      headers.map(escapeCSV).join(','),
      ...rows.map(c => {
        const cf = ((c as Record<string, unknown>).custom_fields ?? {}) as Record<string, string>
        const standard = [
          c.name, c.type, c.email, c.phone, c.website, c.tax_number,
          c.currency, c.tier, c.terms, c.tax_rate,
          c.credit_limit, c.disc_type, c.disc_value, c.balance_owing,
          c.bill_street, c.bill_city, c.bill_postcode, c.bill_country,
          c.ship_name, c.ship_street, c.ship_city, c.ship_postcode, c.ship_country,
          c.status, c.notes,
        ]
        const cfVals = customFields.map(f => cf[f.id] ?? '')
        const clVals = customLists.map(l => cf[l.id] ?? '')
        return [...standard, ...cfVals, ...clVals].map(escapeCSV).join(',')
      }),
    ]

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-${type}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 28 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Export Contacts</div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 24 }}>Choose which contacts to export as a CSV file.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { key: 'all', label: 'All Contacts', count: counts.all },
            { key: 'customer', label: 'Customers Only', count: counts.customer },
            { key: 'supplier', label: 'Suppliers Only', count: counts.supplier },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => doExport(opt.key)}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 18px',
                background: 'var(--white)', border: '1.5px solid var(--gray-200)',
                borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                color: 'var(--slate)', fontFamily: 'var(--font-display)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--indigo)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--gray-200)')}
            >
              <span>{opt.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--gray-400)' }}>{opt.count} total</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{ width: '100%', marginTop: 16, padding: '12px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: 'var(--gray-400)', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Import Modal ──────────────────────────────────────────────────────

function ImportModal({
  orgId,
  customFields,
  customLists,
  onImported,
  onClose,
}: {
  orgId: string
  customFields: { id: string; name: string; field_type: string }[]
  customLists: { id: string; name: string; options: { id: string; value: string }[] }[]
  onImported: (contacts: Record<string, unknown>[]) => void
  onClose: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [importAs, setImportAs] = useState<'customer' | 'supplier'>('customer')
  const [ignoreDupes, setIgnoreDupes] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  function downloadTemplate() {
    const STANDARD_HEADERS = [
      'Name', 'Email', 'Phone', 'Website', 'Tax Number',
      'Currency', 'Price Tier', 'Payment Terms', 'Tax Rate',
      'Credit Limit', 'Discount Type', 'Discount Value',
      'Billing Street', 'Billing City', 'Billing Postcode', 'Billing Country',
      'Ship Name', 'Shipping Street', 'Shipping City', 'Shipping Postcode', 'Shipping Country',
      'Notes',
    ]
    const cfHeaders = customFields.map(f => f.name)
    const clHeaders = customLists.map(l => l.name)
    const headers = [...STANDARD_HEADERS, ...cfHeaders, ...clHeaders]
    const blob = new Blob([headers.join(',') + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
      else cur += ch
    }
    result.push(cur)
    return result
  }

  async function handleImport() {
    if (!file) { setError('Please select a CSV file.'); return }
    setImporting(true); setError(null); setValidationErrors([])

    const text = await file.text()
    const rawLines = text.split('\n').map(l => l.trim())
    const lines = rawLines.filter(Boolean)
    if (lines.length < 2) { setError('CSV file appears empty — it must have a header row and at least one data row.'); setImporting(false); return }

    const headers = parseCSVLine(lines[0]).map(h => h.trim())

    // Must have a Name column
    if (!headers.map(h => h.toLowerCase()).includes('name')) {
      setError('CSV is missing a required "Name" column.')
      setImporting(false); return
    }

    const fieldMap: Record<string, string> = {
      'name': 'name', 'email': 'email', 'phone': 'phone', 'website': 'website',
      'tax number': 'tax_number', 'currency': 'currency', 'price tier': 'tier',
      'payment terms': 'terms', 'tax rate': 'tax_rate', 'credit limit': 'credit_limit',
      'discount type': 'disc_type', 'discount value': 'disc_value',
      'billing street': 'bill_street', 'billing city': 'bill_city',
      'billing postcode': 'bill_postcode', 'billing country': 'bill_country',
      'ship name': 'ship_name', 'shipping street': 'ship_street',
      'shipping city': 'ship_city', 'shipping postcode': 'ship_postcode',
      'shipping country': 'ship_country', 'notes': 'notes',
    }

    const cfNameToId: Record<string, string> = {}
    customFields.forEach(f => { cfNameToId[f.name.toLowerCase()] = f.id })
    customLists.forEach(l => { cfNameToId[l.name.toLowerCase()] = l.id })

    // ── Phase 1: validate ALL rows ────────────────────────────────────
    const errors: string[] = []
    const parsedRows: Record<string, unknown>[] = []

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1 // 1-based, accounting for header
      const vals = parseCSVLine(lines[i])
      const row: Record<string, unknown> = { type: importAs, org_id: orgId }
      const customFieldValues: Record<string, string> = {}

      headers.forEach((h, idx) => {
        const val = vals[idx]?.trim() ?? ''
        const lower = h.toLowerCase()
        if (fieldMap[lower]) {
          if (val) row[fieldMap[lower]] = val
        } else if (cfNameToId[lower]) {
          if (val) customFieldValues[cfNameToId[lower]] = val
        }
      })

      if (Object.keys(customFieldValues).length > 0) row.custom_fields = customFieldValues

      // Mandatory field check
      if (!String(row.name ?? '').trim()) {
        errors.push(`Row ${rowNum}: "Name" is required but is empty.`)
      }

      parsedRows.push(row)
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
      setImporting(false)
      return
    }

    // ── Phase 2: all rows valid — create them all ─────────────────────
    let imported = 0, skipped = 0
    const newContacts: Record<string, unknown>[] = []

    for (const row of parsedRows) {
      const res = await fetch('/api/org/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      })

      if (res.ok) {
        const created = await res.json()
        newContacts.push(created)
        imported++
      } else {
        const body = await res.json().catch(() => ({}))
        const errMsg = (body.error ?? '').toLowerCase()
        // Count duplicate email as a skip when ignore_duplicates is on, otherwise count as skipped with a note
        if (ignoreDupes && errMsg.includes('email')) {
          skipped++
        } else {
          skipped++
        }
      }
    }

    onImported(newContacts as Parameters<typeof onImported>[0])
    setResult({ imported, skipped })
    setImporting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 28 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Import Contacts</div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>Upload a CSV file to import contacts into your account.</div>

        {result ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Import complete</div>
            <div style={{ fontSize: 13.5, color: 'var(--gray-400)' }}>
              {result.imported} contact{result.imported !== 1 ? 's' : ''} imported
              {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}.
            </div>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 13, color: '#B91C1C', marginBottom: 16 }}>{error}</div>
            )}

            {validationErrors.length > 0 && (
              <div style={{ padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', marginBottom: 6 }}>
                  Import blocked — {validationErrors.length} row{validationErrors.length !== 1 ? 's have' : ' has'} missing required data. Fix the file and try again.
                </div>
                <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {validationErrors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#B91C1C' }}>• {e}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              ref={dropRef}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--indigo)' }}
              onDragLeave={() => { dropRef.current!.style.borderColor = 'var(--gray-200)' }}
              onDrop={e => {
                e.preventDefault()
                dropRef.current!.style.borderColor = 'var(--gray-200)'
                const f = e.dataTransfer.files[0]
                if (f && f.name.endsWith('.csv')) { setFile(f); setError(null); setValidationErrors([]) }
                else setError('Please upload a .csv file.')
              }}
              style={{
                border: '2px dashed var(--gray-200)', borderRadius: 10, padding: '28px 20px',
                textAlign: 'center', cursor: 'pointer', marginBottom: 20,
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)' }}>
                {file ? file.name : 'Drop CSV file here or click to browse'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'No file selected'}
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); setValidationErrors([]) } else setError('Please upload a .csv file.') }} />
            </div>

            {/* Import as */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Import As</div>
              <div style={{ display: 'flex', gap: 20 }}>
                {(['customer', 'supplier'] as const).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, cursor: 'pointer', color: 'var(--slate)' }}>
                    <input
                      type="radio"
                      name="importAs"
                      value={t}
                      checked={importAs === t}
                      onChange={() => setImportAs(t)}
                      style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                    />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* Ignore duplicates */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--slate)', cursor: 'pointer', marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={ignoreDupes}
                onChange={e => setIgnoreDupes(e.target.checked)}
                style={{ accentColor: 'var(--teal)', marginTop: 2, cursor: 'pointer' }}
              />
              Ignore duplicates — do not update existing contacts with the same email address
            </label>

            {/* Sample template */}
            <div style={{ padding: '12px 16px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12.5, color: 'var(--gray-400)', marginBottom: 20 }}>
              Not sure about the format?{' '}
              <button
                onClick={downloadTemplate}
                style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}
              >
                Download Sample Template
              </button>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={importing}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleImport} disabled={importing || !file}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
