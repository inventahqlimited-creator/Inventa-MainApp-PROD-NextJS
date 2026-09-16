'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Org = Record<string, unknown>
type Location = { id: string; name: string; type: string; address: string | null; active: boolean }
type TaxRate = { id: string; name: string; code: string; rate: number; is_default: boolean }
type Currency = { id: string; code: string; name: string; rate: number; symbol: string | null }

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="modal-field">
      <label className="modal-label">{label}</label>
      {children}
    </div>
  )
}

function MInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input className="modal-input" type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ background: 'var(--white)' }} />
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="modal-input" value={value} onChange={e => onChange(e.target.value)} style={{ background: 'var(--white)', cursor: 'pointer' }}>
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

export default function SettingsClient({
  org,
  locations: initialLocations,
  taxRates: initialTaxRates,
  currencies: initialCurrencies,
  orgId,
  isAdmin,
  initialTab,
}: {
  org: Org
  locations: Location[]
  taxRates: TaxRate[]
  currencies: Currency[]
  orgId: string
  isAdmin: boolean
  initialTab: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'general')

  // Org details
  const [bizName, setBizName] = useState(String(org.name ?? ''))
  const [bizEmail, setBizEmail] = useState(String(org.email ?? ''))
  const [bizPhone, setBizPhone] = useState(String(org.phone ?? ''))
  const [bizAddress, setBizAddress] = useState(String(org.address ?? ''))
  const [country, setCountry] = useState(String(org.country ?? 'New Zealand'))
  const [baseCurrency, setBaseCurrency] = useState(String(org.base_currency ?? 'NZD'))
  const [timezone, setTimezone] = useState(String(org.timezone ?? 'Pacific/Auckland'))
  const [savingOrg, setSavingOrg] = useState(false)
  const [orgSaved, setOrgSaved] = useState(false)

  // Locations
  const [locations, setLocations] = useState(initialLocations)
  const [newLocName, setNewLocName] = useState('')
  const [newLocType, setNewLocType] = useState('Warehouse')
  const [addingLoc, setAddingLoc] = useState(false)

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
  const [serialTracking, setSerialTracking] = useState(false)
  const [batchTracking, setBatchTracking] = useState(false)
  const [expiryTracking, setExpiryTracking] = useState(false)
  const [decimalQty, setDecimalQty] = useState(false)

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
    setTimeout(() => setToast(null), 3000)
  }

  async function saveOrg() {
    setSavingOrg(true)
    const res = await fetch(`/api/org/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bizName, email: bizEmail, phone: bizPhone, address: bizAddress, country, base_currency: baseCurrency, timezone }),
    })
    setSavingOrg(false)
    if (res.ok) { showToast('success', 'Business details saved'); setOrgSaved(true) }
    else showToast('error', 'Failed to save')
  }

  async function addLocation() {
    if (!newLocName.trim()) return
    setAddingLoc(true)
    const res = await fetch('/api/org/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newLocName.trim(), type: newLocType, active: true }),
    })
    const data = await res.json()
    setAddingLoc(false)
    if (res.ok) {
      setLocations(prev => [...prev, { id: data.id, name: newLocName.trim(), type: newLocType, address: null, active: true }])
      setNewLocName('')
      showToast('success', 'Location added')
    } else showToast('error', data.error ?? 'Failed to add location')
  }

  async function toggleLocation(id: string, active: boolean) {
    await fetch(`/api/org/locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    setLocations(prev => prev.map(l => l.id === id ? { ...l, active } : l))
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

  const poPreview = `${poPrefix}${String(parseInt(poStart) || 1).padStart(4, '0')}`
  const soPreview = `${soPrefix}${String(parseInt(soStart) || 1).padStart(4, '0')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Page header */}
      <div className="page-header-card">
        <div className="page-header-top">
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

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 60px' }}>

        {/* ── GENERAL ── */}
        {tab === 'general' && (
          <>
            <Card title="Business Details" subtitle="Your organisation's core information" action={<SaveBtn onClick={saveOrg} saving={savingOrg} />}>
              <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label className="modal-label">Business Name</label>
                  <MInput value={bizName} onChange={setBizName} placeholder="Acme Ltd" />
                </div>
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label className="modal-label">Address</label>
                  <MInput value={bizAddress} onChange={setBizAddress} placeholder="123 Main St, Auckland 1010" />
                </div>
                <Field label="Phone"><MInput value={bizPhone} onChange={setBizPhone} placeholder="+64 9 000 0000" /></Field>
                <Field label="Email"><MInput value={bizEmail} onChange={setBizEmail} placeholder="orders@business.com" type="email" /></Field>
                <Field label="Country">
                  <Select value={country} onChange={setCountry} options={['New Zealand','Australia','United States','United Kingdom','Canada','Singapore'].map(c => ({ value: c, label: c }))} />
                </Field>
                <Field label="Base Currency">
                  <Select value={baseCurrency} onChange={setBaseCurrency} options={[
                    { value: 'NZD', label: 'NZD — New Zealand Dollar' },
                    { value: 'AUD', label: 'AUD — Australian Dollar' },
                    { value: 'USD', label: 'USD — US Dollar' },
                    { value: 'GBP', label: 'GBP — British Pound' },
                    { value: 'EUR', label: 'EUR — Euro' },
                    { value: 'SGD', label: 'SGD — Singapore Dollar' },
                  ]} />
                </Field>
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
              </div>
            </Card>

            <Card title="Tax Rates" subtitle="Define tax codes used across the system" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addTaxRate} disabled={addingTax}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Tax Rate
              </button>
            }>
              <div style={{ padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end', borderBottom: '1px solid var(--gray-100)' }}>
                <Field label="Tax Name"><MInput value={newTaxName} onChange={setNewTaxName} placeholder="e.g. GST" /></Field>
                <Field label="Tax Code"><MInput value={newTaxCode} onChange={setNewTaxCode} placeholder="e.g. GST15" /></Field>
                <Field label="Rate (%)"><MInput value={newTaxRate} onChange={setNewTaxRate} placeholder="e.g. 15" type="number" /></Field>
                <button className="btn btn-outline" style={{ height: 36, marginBottom: 0 }} onClick={addTaxRate}>Add</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th className="li-th">Tax Code</th>
                    <th className="li-th">Name</th>
                    <th className="li-th" style={{ textAlign: 'right' }}>Rate (%)</th>
                    <th className="li-th" style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {taxRates.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>No tax rates configured.</td></tr>
                  )}
                  {taxRates.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{t.code}</span></td>
                      <td className="li-td" style={{ color: 'var(--gray-900)', fontSize: 13 }}>{t.name}</td>
                      <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{t.rate}%</td>
                      <td className="li-td">
                        <button onClick={() => deleteTaxRate(t.id)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

            <Card title="Locations" subtitle="Warehouses, stores and other stock locations" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addLocation} disabled={addingLoc}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Location
              </button>
            }>
              <div style={{ padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', borderBottom: '1px solid var(--gray-100)' }}>
                <Field label="Location Name"><MInput value={newLocName} onChange={setNewLocName} placeholder="e.g. Main Warehouse" /></Field>
                <Field label="Type">
                  <Select value={newLocType} onChange={setNewLocType} options={['Warehouse','Store','Supplier','Virtual'].map(t => ({ value: t, label: t }))} />
                </Field>
                <button className="btn btn-outline" style={{ height: 36 }} onClick={addLocation}>Add</button>
              </div>
              <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {locations.length === 0 && <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--gray-400)', fontSize: 13 }}>No locations yet.</div>}
                {locations.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)', fontFamily: 'var(--font-display)' }}>{l.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{l.type}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: l.active ? '#059669' : 'var(--gray-400)', fontWeight: 600 }}>{l.active ? 'Active' : 'Inactive'}</span>
                      <button className="status-toggle" data-active={String(l.active)} onClick={() => toggleLocation(l.id, !l.active)} type="button">
                        <div className="status-toggle-knob" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Currencies" subtitle="Additional currencies and exchange rates" action={
              <button className="btn btn-primary" style={{ height: 32, fontSize: 12.5 }} onClick={addCurrency}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Currency
              </button>
            }>
              <div style={{ padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end', borderBottom: '1px solid var(--gray-100)' }}>
                <Field label="Code"><MInput value={newCurrCode} onChange={setNewCurrCode} placeholder="e.g. USD" /></Field>
                <Field label="Name"><MInput value={newCurrName} onChange={setNewCurrName} placeholder="e.g. US Dollar" /></Field>
                <Field label="Exchange Rate"><MInput value={newCurrRate} onChange={setNewCurrRate} placeholder="e.g. 0.62" type="number" /></Field>
                <button className="btn btn-outline" style={{ height: 36 }} onClick={addCurrency}>Add</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th className="li-th">Code</th>
                    <th className="li-th">Name</th>
                    <th className="li-th" style={{ textAlign: 'right' }}>Rate to {String(baseCurrency)}</th>
                    <th className="li-th" style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {currencies.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>No additional currencies.</td></tr>
                  )}
                  {currencies.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td className="li-td"><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>{c.code}</span></td>
                      <td className="li-td" style={{ color: 'var(--gray-900)', fontSize: 13 }}>{c.name}</td>
                      <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{c.rate}</td>
                      <td className="li-td">
                        <button onClick={() => deleteCurrency(c.id)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
          <Card title="Default Contact Settings" subtitle="Pre-filled values when adding a new contact" action={<SaveBtn onClick={() => showToast('success', 'Contact defaults saved')} />}>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
              <Field label="Default Tax Rate">
                <Select value="15% — GST (NZ)" onChange={() => {}} options={['0% — Tax Exempt','10% — GST (AU)','15% — GST (NZ)','20% — VAT (UK)'].map(t => ({ value: t, label: t }))} />
              </Field>
              <Field label="Default Payment Terms">
                <Select value="Net 30" onChange={() => {}} options={['Net 7','Net 14','Net 30','Net 60','COD','Prepaid'].map(t => ({ value: t, label: t }))} />
              </Field>
              <Field label="Default Price Tier">
                <Select value="Retail" onChange={() => {}} options={['Retail','Wholesale','VIP'].map(t => ({ value: t, label: t }))} />
              </Field>
              <Field label="Default Currency">
                <Select value="NZD" onChange={() => {}} options={['NZD','AUD','USD','GBP','EUR'].map(t => ({ value: t, label: t }))} />
              </Field>
            </div>
          </Card>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <>
            <Card title="Inventory Tracking" subtitle="Configure serial and batch tracking defaults">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ToggleRow label="Serial Number Tracking" sub="Track individual serial numbers for each unit received" active={serialTracking} onChange={setSerialTracking} />
                <ToggleRow label="Batch / Lot Tracking" sub="Group received items into batches or lots for traceability" active={batchTracking} onChange={setBatchTracking} />
                <ToggleRow label="Expiry Date Tracking" sub="All new products will have expiry date tracking enabled by default" active={expiryTracking} onChange={setExpiryTracking} />
              </div>
            </Card>
            <Card title="Quantity Settings" subtitle="Control how quantities are entered and displayed">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ToggleRow label="Allow Decimal Quantities" sub="Enables buying and selling in fractional quantities (e.g. 0.5, 1.25)" active={decimalQty} onChange={setDecimalQty} />
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
                <Field label="Start Number">
                  <MInput value={poStart} onChange={setPoStart} type="number" placeholder="1" />
                </Field>
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
              <Field label="Start Number">
                <MInput value="1" onChange={() => {}} type="number" />
              </Field>
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
                <Field label="Start Number">
                  <MInput value={soStart} onChange={setSoStart} type="number" />
                </Field>
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
            <div style={{ padding: '20px', color: 'var(--gray-400)', fontSize: 13, textAlign: 'center' }}>
              Security settings coming soon.
            </div>
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
            <div className="toast-body">
              <div className="toast-title">{toast.msg}</div>
            </div>
            <button className="toast-close" onClick={() => setToast(null)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
