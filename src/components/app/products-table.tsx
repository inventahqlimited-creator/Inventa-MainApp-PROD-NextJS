'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Product = {
  id: string
  name: string
  sku: string | null
  description: string | null
  type: string
  unit: string | null
  sell_price: number | null
  cost_price: number | null
  is_active: boolean | null
  track_stock: boolean | null
  low_stock_threshold: number | null
  barcode: string | null
  default_supplier_id: string | null
  last_cost: number | null
  avg_cost: number | null
  batch_tracking: boolean | null
  serial_tracking: boolean | null
  expiry_tracking: boolean | null
  sell_uom: string | null
  buy_uom: string | null
  buy_uom_qty: number | null
  sell_uom_qty: number | null
  supplier_code: string | null
  lead_time_days: number | null
  min_order_qty: number | null
  notes: string | null
  tax_rate: string | null
  custom_fields: Record<string, string> | null
}

type StockLevel = {
  product_id: string
  location_id: string
  quantity: number
  on_order: number
  committed: number
  on_hold: number
  reserved_quantity: number
}

type Location = {
  id: string
  name: string
}

type Supplier = {
  id: string
  name: string
}

type PricingRow = {
  id?: string
  price_level: string
  price: number
  break_qty: number
}

type ModalForm = {
  sku: string
  name: string
  type: string
  barcode: string
  low_stock_threshold: string
  tax_rate: string
  description: string
  cost_price: string
  buy_uom: string
  buy_uom_qty: string
  sell_price: string
  sell_uom: string
  sell_uom_qty: string
  serial_tracking: boolean
  batch_tracking: boolean
  expiry_tracking: boolean
  default_supplier_id: string
  supplier_code: string
  lead_time_days: string
  min_order_qty: string
  notes: string
  is_active: boolean
  track_stock: boolean
}

const EMPTY_FORM: ModalForm = {
  sku: '', name: '', type: 'Stock', barcode: '', low_stock_threshold: '',
  tax_rate: '', description: '', cost_price: '', buy_uom: 'Each', buy_uom_qty: '1',
  sell_price: '', sell_uom: 'Each', sell_uom_qty: '1',
  serial_tracking: false, batch_tracking: false, expiry_tracking: false,
  default_supplier_id: '', supplier_code: '', lead_time_days: '', min_order_qty: '',
  notes: '', is_active: true, track_stock: true,
}

const UOM_OPTIONS = ['Each','Box','Carton','Kg','g','L','mL','m','Pair','Pack','Set','Dozen','Roll','Sheet','Unit']

const PRICE_LEVELS = ['Retail', 'Wholesale', 'VIP']

const COLS = [
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'unit', label: 'Unit' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'sell_price', label: 'Sale Price' },
  { key: 'cost_price', label: 'Cost Price' },
  { key: 'on_hand', label: 'On Hand' },
  { key: 'on_order', label: 'On Order' },
  { key: 'committed', label: 'Committed' },
  { key: 'available', label: 'Available' },
]

const DEFAULT_VISIBLE = new Set(['type', 'status', 'unit', 'sell_price', 'on_hand', 'on_order', 'committed', 'available'])

function fmt(n: number | null | undefined, dp = 2) {
  if (n == null) return '—'
  return `$${Number(n).toFixed(dp)}`
}

function typeBadge(type: string) {
  if (type === 'NonStock') return <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Non Stock</span>
  if (type === 'Service') return <span className="badge" style={{ background: '#DBEAFE', color: '#1E40AF' }}>Service</span>
  return <span className="badge" style={{ background: 'var(--teal-pale)', color: '#0B7A6E' }}>Stock</span>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pm-section">
      <div className="pm-section-hd">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="modal-field">
      <label className="modal-label">
        {label}
        {hint && <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 400, marginLeft: 4 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function MInput({ value, onChange, onBlur, placeholder, type = 'text', disabled, prefix, mono }: {
  value: string; onChange?: (v: string) => void; onBlur?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean; prefix?: string; mono?: boolean
}) {
  return (
    <div style={{ position: 'relative' }}>
      {prefix && <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--gray-400)', pointerEvents: 'none' }}>{prefix}</span>}
      <input
        className="modal-input"
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onBlur={e => onBlur?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          opacity: disabled ? 0.7 : 1,
          cursor: disabled ? 'default' : 'text',
          paddingLeft: prefix ? 24 : undefined,
          fontFamily: mono ? 'monospace' : undefined,
        }}
      />
    </div>
  )
}

function UomSelect({ value, onChange, disabled, label, options }: { value: string; onChange?: (v: string) => void; disabled?: boolean; label: string; options?: string[] }) {
  const [open, setOpen] = useState(false)
  const list = options && options.length > 0 ? options : UOM_OPTIONS
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="modal-dd-btn"
        onClick={() => !disabled && setOpen(o => !o)}
        type="button"
        style={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'default' : 'pointer' }}
      >
        <span>{value || label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }}>
          <div className="col-dropdown-title">{label}</div>
          {list.map(u => (
            <div key={u} className={`fp-item${value === u ? ' active' : ''}`} onClick={() => { onChange?.(u); setOpen(false) }}>{u}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ active, onChange, disabled }: { active: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      className="status-toggle"
      data-active={String(active)}
      onClick={() => !disabled && onChange?.(!active)}
      type="button"
      style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.8 : 1 }}
    >
      <div className="status-toggle-knob" />
    </button>
  )
}

type TaxRate = { id: string; name: string; rate: number }
type Uom = { id: string; name: string; abbr?: string }
type PriceLevel = { id: string; name: string; is_default?: boolean }
type CustomField = { id: string; name: string; field_type: string }
type CustomList = { id: string; name: string; options: { id: string; value: string }[] }
type OrgSettings = {
  serial_tracking?: boolean
  batch_tracking?: boolean
  expiry_tracking?: boolean
}

// ── Export Modal ──────────────────────────────────────────────────────────────
function ExportModal({ products, customFields, decimalPlaces, taxRates, priceLevels, orgId, onClose }: {
  products: Product[]
  customFields: CustomField[]
  decimalPlaces: number
  taxRates: TaxRate[]
  priceLevels: PriceLevel[]
  orgId: string
  onClose: () => void
}) {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function doExport() {
    setExporting(true)
    const rows = includeInactive ? products : products.filter(p => p.is_active)

    // Fetch all pricing rows for this org
    const sb = createClient()
    const { data: allPricing } = await sb.from('product_pricing').select('product_id, level_id, price, break_qty').in('product_id', rows.map(p => p.id))
    // Build map: product_id → { level_id → price }
    const pricingMap = new Map<string, Map<string, number>>()
    for (const row of (allPricing ?? []) as { product_id: string; level_id: string; price: number }[]) {
      if (!pricingMap.has(row.product_id)) pricingMap.set(row.product_id, new Map())
      pricingMap.get(row.product_id)!.set(row.level_id, row.price)
    }

    const stdHeaders = ['Product ID', 'Name', 'SKU', 'Type', 'Description', 'Barcode', 'Sell Price', 'Cost Price', 'Tax Rate', 'Sell UOM', 'Buy UOM', 'Track Stock', 'Serial Tracking', 'Batch Tracking', 'Expiry Tracking', 'Active']
    const plHeaders = priceLevels.map(pl => `Price: ${pl.name}`)
    const cfHeaders = customFields.map(f => f.name)
    const headers = [...stdHeaders, ...plHeaders, ...cfHeaders]

    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }

    const lines = [
      headers.join(','),
      ...rows.map(p => {
        const cf = (p.custom_fields ?? {}) as Record<string, string>
        const prodPricing = pricingMap.get(p.id)
        return [
          p.id, p.name, p.sku ?? '', p.type, p.description ?? '', p.barcode ?? '',
          p.sell_price != null ? Number(p.sell_price).toFixed(decimalPlaces) : '',
          p.cost_price != null ? Number(p.cost_price).toFixed(decimalPlaces) : '',
          (() => { const stored = Number(p.tax_rate); const m = taxRates.find(t => t.rate === stored); return m ? `${m.rate}% — ${m.name}` : (p.tax_rate ? String(p.tax_rate) : '') })(),
          p.sell_uom ?? '', p.buy_uom ?? '',
          p.track_stock ? 'Yes' : 'No',
          p.serial_tracking ? 'Yes' : 'No',
          p.batch_tracking ? 'Yes' : 'No',
          p.expiry_tracking ? 'Yes' : 'No',
          p.is_active ? 'Yes' : 'No',
          ...priceLevels.map(pl => {
            const price = prodPricing?.get(pl.id)
            return price != null ? Number(price).toFixed(decimalPlaces) : ''
          }),
          ...customFields.map(f => cf[f.id] ?? ''),
        ].map(escape).join(',')
      }),
    ]

    setExporting(false)
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <div className="modal-body" style={{ paddingTop: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--slate)', cursor: 'pointer', userSelect: 'none' }}>
        <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} style={{ accentColor: 'var(--teal)', width: 15, height: 15, cursor: 'pointer' }} />
        Include inactive products
      </label>
      <div className="modal-footer" style={{ marginTop: 20 }}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={doExport} disabled={exporting}>{exporting ? 'Preparing…' : 'Export CSV'}</button>
      </div>
    </div>
  )
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ orgId, customFields, customLists, taxRates, suppliers, priceLevels, uoms, onClose, onImported }: {
  orgId: string
  customFields: CustomField[]
  customLists: CustomList[]
  taxRates: TaxRate[]
  suppliers: { id: string; name: string }[]
  priceLevels: { id: string; name: string }[]
  uoms: { id: string; name: string; abbr?: string }[]
  onClose: () => void
  onImported: (products: unknown[]) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [skipDupes, setSkipDupes] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [imported, setImported] = useState<{ created: number; updated: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const uomList = uoms.length > 0 ? uoms.map(u => u.name).join('/') : 'Each/Box/Carton'
    const taxList = taxRates.map(t => `${t.rate}% ${t.name}`).join(' | ') || 'e.g. 15% GST on Income'
    const supplierList = suppliers.map(s => s.name).join(' | ') || 'e.g. Pacific Supply Co.'
    const plHeaders = priceLevels.map(pl => `Price: ${pl.name}`)
    const cfHeaders = customFields.map(f => f.name)
    const clHeaders = customLists.map(cl => cl.name)

    const headers = [
      'Name*',
      'SKU*',
      `Type (Stock/NonStock/Service)`,
      'Description',
      'Barcode',
      `Sell Price`,
      `Cost Price`,
      `Tax Rate (${taxList})`,
      `Sell UOM (${uomList})`,
      `Buy UOM (${uomList})`,
      'Buy UOM Qty',
      'Track Stock (Yes/No)',
      'Serial Tracking (Yes/No)',
      'Batch Tracking (Yes/No)',
      'Expiry Tracking (Yes/No)',
      `Supplier (${supplierList})`,
      'Supplier Code',
      'Lead Time (days)',
      'Min Order Qty',
      'Notes',
      ...plHeaders,
      ...cfHeaders,
      ...clHeaders,
    ]

    const blob = new Blob([headers.join(',') + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'products-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function doImport() {
    if (!file) return
    setImporting(true)
    setErrors([])
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) { setErrors(['File is empty or has no data rows.']); setImporting(false); return }

    const rawHeaders = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
    const nameIdx = rawHeaders.findIndex(h => h.includes('name'))
    const skuIdx = rawHeaders.findIndex(h => h.includes('sku') || h.includes('product #') || h.includes('product id'))

    const parseRow = (line: string): string[] => {
      const result: string[] = []
      let cur = '', inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ } else if (ch === ',' && !inQ) { result.push(cur); cur = '' } else { cur += ch }
      }
      result.push(cur)
      return result
    }

    // Phase 1: validate
    const rowErrors: string[] = []
    const dataRows = lines.slice(1)
    for (let i = 0; i < dataRows.length; i++) {
      const cols = parseRow(dataRows[i])
      const name = nameIdx >= 0 ? cols[nameIdx]?.trim() : ''
      if (!name) rowErrors.push(`Row ${i + 2}: Product Name is required`)
    }
    if (rowErrors.length > 0) { setErrors(rowErrors); setImporting(false); return }

    // Pre-compute column indexes for efficiency
    const typeIdx = rawHeaders.findIndex(h => h.includes('type'))
    const descIdx = rawHeaders.findIndex(h => h.includes('desc'))
    const barcodeIdx = rawHeaders.findIndex(h => h.includes('barcode'))
    const sellPriceIdx = rawHeaders.findIndex(h => h.startsWith('sell price') || h === 'sell price')
    const costPriceIdx = rawHeaders.findIndex(h => h.startsWith('cost price') || h === 'cost price')
    const taxIdx = rawHeaders.findIndex(h => h.startsWith('tax rate') || h === 'tax rate' || h === 'tax')
    // sell uom before buy uom to avoid partial match collision
    const sellUomIdx = rawHeaders.findIndex(h => h.startsWith('sell uom'))
    const buyUomIdx = rawHeaders.findIndex(h => h.startsWith('buy uom') && !h.includes('qty'))
    const buyUomQtyIdx = rawHeaders.findIndex(h => h.includes('buy uom qty') || h.includes('units per'))
    const trackStockIdx = rawHeaders.findIndex(h => h.startsWith('track stock'))
    const serialIdx = rawHeaders.findIndex(h => h.startsWith('serial'))
    const batchIdx = rawHeaders.findIndex(h => h.startsWith('batch'))
    const expiryIdx = rawHeaders.findIndex(h => h.startsWith('expiry'))
    const supplierIdx = rawHeaders.findIndex(h => h.startsWith('supplier') && !h.includes('code'))
    const supplierCodeIdx = rawHeaders.findIndex(h => h.includes('supplier code'))
    const leadTimeIdx = rawHeaders.findIndex(h => h.includes('lead time'))
    const minOrderIdx = rawHeaders.findIndex(h => h.includes('min order'))
    const notesIdx = rawHeaders.findIndex(h => h === 'notes')

    // Price level column indexes: "price: retail" etc
    const plIndexes: { plId: string; colIdx: number }[] = priceLevels.map(pl => ({
      plId: pl.id,
      colIdx: rawHeaders.findIndex(h => h === `price: ${pl.name.toLowerCase()}`),
    })).filter(x => x.colIdx >= 0)

    // Custom field indexes
    const cfIndexes: { fId: string; colIdx: number }[] = customFields.map(f => ({
      fId: f.id,
      colIdx: rawHeaders.findIndex(h => h === f.name.toLowerCase()),
    })).filter(x => x.colIdx >= 0)

    // Custom list indexes
    const clIndexes: { listId: string; colIdx: number }[] = customLists.map(cl => ({
      listId: cl.id,
      colIdx: rawHeaders.findIndex(h => h === cl.name.toLowerCase()),
    })).filter(x => x.colIdx >= 0)

    // Phase 2: upsert
    // Pre-load existing SKUs → { sku_lower: product_id } for update mode
    const sb = createClient()
    const { data: existingProds } = await sb.from('products').select('id, sku').eq('org_id', orgId).not('sku', 'is', null)
    const existingSkuMap = new Map<string, string>(
      (existingProds ?? []).map((p: { id: string; sku: string }) => [p.sku.toLowerCase(), p.id])
    )

    const createdItems: unknown[] = []
    let updatedCount = 0

    // Helper: upsert pricing rows for a product
    async function upsertPricing(productId: string, pricingData: { price_level: string; price: number; break_qty: number }[]) {
      if (pricingData.length === 0) return
      const pricingRows = pricingData.flatMap(pd => {
        const pl = priceLevels.find(p => p.name === pd.price_level)
        return pl ? [{ org_id: orgId, product_id: productId, level_id: pl.id, price: pd.price, break_qty: pd.break_qty }] : []
      })
      if (pricingRows.length === 0) return
      const session = (await sb.auth.getSession()).data.session
      // Delete existing rows for this product+level combo then reinsert (clean upsert)
      for (const row of pricingRows) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/product_pricing?product_id=eq.${productId}&level_id=eq.${row.level_id}`, {
          method: 'DELETE',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${session?.access_token}`,
          },
        })
      }
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/product_pricing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${session?.access_token}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(pricingRows),
      })
    }

    // Helper: translate API errors to friendly messages
    function friendlyError(status: number, rawMsg: string): string {
      const m = rawMsg.toLowerCase()
      if (status === 409 || m.includes('duplicate') || m.includes('unique')) return 'a product with this SKU already exists'
      if (m.includes('not null') || m.includes('null value')) return 'a required field is missing'
      if (m.includes('foreign key') || m.includes('violates')) return 'one or more values don\'t match your account settings'
      if (m.includes('column') && m.includes('schema')) return 'the file format doesn\'t match the template — please re-download the template'
      if (status >= 500) return 'a server error occurred, please try again'
      if (status === 401 || status === 403) return 'you don\'t have permission to import products'
      return 'couldn\'t be saved — please check the row and try again'
    }

    for (const line of dataRows) {
      const cols = parseRow(line)
      const get = (idx: number) => idx >= 0 ? (cols[idx] ?? '').trim() : ''
      const name = get(nameIdx)
      if (!name) continue

      // Resolve tax rate
      const taxStr = get(taxIdx).toLowerCase()
      let resolvedTaxRate: number | null = null
      if (taxStr) {
        const matchedTax = taxRates.find(t => {
          const rateStr = String(t.rate)
          return taxStr.includes(rateStr) || taxStr.replace(/[^a-z0-9]/g, '').includes(t.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        })
        if (matchedTax) resolvedTaxRate = matchedTax.rate
      }

      // Resolve supplier
      const supplierName = get(supplierIdx).toLowerCase()
      const matchedSupplier = supplierName ? suppliers.find(s => s.name.toLowerCase() === supplierName) : null

      const parseBool = (idx: number) => get(idx).toLowerCase() === 'yes'

      // Custom fields
      const cfValues: Record<string, string> = {}
      cfIndexes.forEach(({ fId, colIdx }) => { const val = get(colIdx); if (val) cfValues[fId] = val })
      clIndexes.forEach(({ listId, colIdx }) => { const val = get(colIdx); if (val) cfValues[`list_${listId}`] = val })

      // Price level data
      const pricingData: { price_level: string; price: number; break_qty: number }[] = []
      plIndexes.forEach(({ plId, colIdx }) => {
        const val = parseFloat(get(colIdx))
        if (!isNaN(val) && val > 0) {
          const pl = priceLevels.find(p => p.id === plId)
          if (pl) pricingData.push({ price_level: pl.name, price: val, break_qty: 1 })
        }
      })

      const typeStr = get(typeIdx).toLowerCase()
      const payload: Record<string, unknown> = {
        org_id: orgId,
        name,
        sku: get(skuIdx) || null,
        type: typeStr.includes('non') ? 'NonStock' : typeStr.includes('serv') ? 'Service' : 'Stock',
        description: get(descIdx) || null,
        barcode: get(barcodeIdx) || null,
        sell_price: parseFloat(get(sellPriceIdx)) || null,
        cost_price: parseFloat(get(costPriceIdx)) || null,
        tax_rate: resolvedTaxRate,
        sell_uom: get(sellUomIdx) || 'Each',
        buy_uom: get(buyUomIdx) || 'Each',
        buy_uom_qty: parseInt(get(buyUomQtyIdx)) || 1,
        track_stock: get(trackStockIdx).toLowerCase() !== 'no',
        serial_tracking: parseBool(serialIdx),
        batch_tracking: parseBool(batchIdx),
        expiry_tracking: parseBool(expiryIdx),
        default_supplier_id: matchedSupplier?.id ?? null,
        supplier_code: get(supplierCodeIdx) || null,
        lead_time_days: parseInt(get(leadTimeIdx)) || null,
        min_order_qty: parseInt(get(minOrderIdx)) || null,
        notes: get(notesIdx) || null,
        custom_fields: Object.keys(cfValues).length > 0 ? cfValues : null,
      }

      const skuVal = payload.sku as string | null
      const existingId = skuVal ? existingSkuMap.get(skuVal.toLowerCase()) : undefined

      if (existingId) {
        // SKU already exists
        if (skipDupes) continue  // skip mode: leave it alone

        // Update mode: PATCH via API
        const res = await fetch(`/api/org/products/${existingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          updatedCount++
          await upsertPricing(existingId, pricingData)
        } else {
          let rawMsg = ''
          try { const b = await res.json(); rawMsg = b?.error || b?.message || JSON.stringify(b) } catch { /* */ }
          console.error('[import] update failed:', name, res.status, rawMsg)
          rowErrors.push(`"${name}" — ${friendlyError(res.status, rawMsg)}`)
          if (rowErrors.length >= 3) break
        }
      } else {
        // New product: POST
        const res = await fetch('/api/org/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const newProduct = await res.json()
          createdItems.push(newProduct)
          console.log('[import] created product:', newProduct)
          await upsertPricing(newProduct.id, pricingData)
        } else {
          let rawMsg = ''
          try { const b = await res.json(); rawMsg = b?.error || b?.message || JSON.stringify(b) } catch { /* */ }
          console.error('[import] create failed:', name, res.status, rawMsg)
          rowErrors.push(`"${name}" — ${friendlyError(res.status, rawMsg)}`)
          if (rowErrors.length >= 3) break
        }
      }
    }

    setImporting(false)
    if (createdItems.length > 0 || updatedCount > 0) {
      setImported({ created: createdItems.length, updated: updatedCount })
      onImported(createdItems)
    } else {
      if (rowErrors.length === 0) rowErrors.push('No products were imported. Make sure your file matches the template format.')
      setErrors(rowErrors)
    }
  }

  if (imported !== null) {
    const total = imported.created + imported.updated
    const parts: string[] = []
    if (imported.created > 0) parts.push(`${imported.created} added`)
    if (imported.updated > 0) parts.push(`${imported.updated} updated`)
    return (
      <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Import Complete</div>
        <div style={{ fontSize: 13.5, color: 'var(--gray-400)', marginBottom: 20 }}>
          {total} product{total !== 1 ? 's' : ''} processed — {parts.join(', ')}.
        </div>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    )
  }

  return (
    <div className="modal-body" style={{ paddingTop: 4 }}>
      <div
        className={`import-drop-zone${dragging ? ' dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.csv')) setFile(f) }}
        onClick={() => fileRef.current?.click()}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate)', marginTop: 10 }}>Drop CSV file here</div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
          or <span style={{ color: 'var(--teal)', textDecoration: 'underline', cursor: 'pointer' }}>browse</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 6 }}>{file ? file.name : 'No file selected'}</div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--slate)', cursor: 'pointer', userSelect: 'none', marginTop: 14 }}>
        <input type="checkbox" checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} style={{ accentColor: 'var(--teal)', width: 14, height: 14, cursor: 'pointer', marginTop: 2 }} />
        <span>
          <span style={{ fontWeight: 600 }}>Skip duplicates</span>
          <span style={{ color: 'var(--gray-400)', marginLeft: 4 }}>
            {skipDupes ? '— existing products with the same SKU will be left unchanged' : '— existing products with the same SKU will be updated'}
          </span>
        </span>
      </label>

      <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 9, padding: '10px 14px', marginTop: 14, fontSize: 12.5, color: 'var(--gray-400)' }}>
        Not sure about the format?{' '}
        <span style={{ color: 'var(--teal)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 500 }} onClick={downloadTemplate}>Download Sample Template</span>
      </div>

      {errors.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', marginTop: 12, maxHeight: 140, overflowY: 'auto' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#B91C1C', marginBottom: 6 }}>Please fix the following errors before importing:</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12.5, color: '#B91C1C', marginBottom: 2 }}>• {e}</div>)}
        </div>
      )}

      <div className="modal-footer" style={{ marginTop: 20 }}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={doImport} disabled={!file || importing}>
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>
      <style>{`
        .import-drop-zone { border: 2px dashed var(--gray-200); border-radius: 12px; padding: 28px 20px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
        .import-drop-zone:hover, .import-drop-zone.dragging { border-color: var(--teal); background: var(--teal-surface); }
      `}</style>
    </div>
  )
}

export default function ProductsTable({
  products: initialProducts,
  stockLevels,
  locations,
  orgId,
  isAdmin,
  suppliers,
  taxRates = [],
  decimalPlaces = 2,
  uoms = [],
  priceLevels = [],
  orgSettings = {},
  customFields = [],
  customLists = [],
  permissions = {},
}: {
  products: Product[]
  stockLevels: StockLevel[]
  locations: Location[]
  orgId: string
  isAdmin: boolean
  suppliers?: Supplier[]
  taxRates?: TaxRate[]
  decimalPlaces?: number
  uoms?: Uom[]
  priceLevels?: PriceLevel[]
  orgSettings?: OrgSettings
  customFields?: CustomField[]
  customLists?: CustomList[]
  permissions?: {
    create_products?: boolean
    edit_products?: boolean
    view_pricing?: boolean
    import_products?: boolean
    export_products?: boolean
  }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Permission shortcuts — admins (isAdmin=true) bypass all checks
  const canCreate = isAdmin || permissions.create_products !== false
  const canEdit = isAdmin || permissions.edit_products !== false
  const canViewPricing = isAdmin || permissions.view_pricing !== false
  const canImport = isAdmin || permissions.import_products !== false
  const canExport = isAdmin || permissions.export_products !== false

  // Derived from props
  // TAX_OPTIONS: value = tax_rate_id (UUID), so we store the id and resolve display text
  // For DB: we store just the numeric rate (t.rate), display the full label in UI
  const TAX_OPTIONS = [
    { value: '', label: 'No Tax (0%)', rate: 0 },
    ...taxRates.map(t => ({ value: t.id, label: `${t.rate}% — ${t.name}`, rate: t.rate })),
  ]
  const dp = decimalPlaces
  const priceStep = dp > 0 ? `0.${'0'.repeat(dp - 1)}1` : '1'
  // UOM list: prefer from settings, fall back to hardcoded
  const UOM_LIST = uoms.length > 0 ? uoms.map(u => u.name) : UOM_OPTIONS
  // Price level names: prefer from settings, fall back to hardcoded
  const PRICE_LEVEL_NAMES = priceLevels.length > 0 ? priceLevels.map(pl => pl.name) : PRICE_LEVELS
  // Tracking options gated by org-level settings
  const trackingOptions = [
    { key: 'serial_tracking' as keyof ModalForm, label: 'Serial Number Tracking', sub: 'Track individual serial numbers per unit', enabled: orgSettings.serial_tracking !== false },
    { key: 'batch_tracking' as keyof ModalForm, label: 'Batch / Lot Tracking', sub: 'Group items into batches for traceability', enabled: orgSettings.batch_tracking !== false },
    { key: 'expiry_tracking' as keyof ModalForm, label: 'Expiry Date Tracking', sub: 'Record and alert on expiry dates', enabled: orgSettings.expiry_tracking !== false },
  ].filter(t => t.enabled)

  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tab, setTab] = useState<'all' | 'instock' | 'nostock'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('products-visible-cols')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {}
    return DEFAULT_VISIBLE
  })
  const [typeOpen, setTypeOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)
  const [advTracking, setAdvTracking] = useState<Set<string>>(new Set())
  const [advUom, setAdvUom] = useState('')
  const [advSupplier, setAdvSupplier] = useState('')
  const [advStock, setAdvStock] = useState('')
  const [taxOpen, setTaxOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const [modal, setModal] = useState<'closed' | 'view' | 'add' | 'edit'>('closed')
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM)
  const [modalTab, setModalTab] = useState<'details' | 'pricing' | 'stock' | 'orders' | 'custom'>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})
  const [pricing, setPricing] = useState<PricingRow[]>([])
  const [productOrders, setProductOrders] = useState<Record<string, unknown>[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Initialize pricing rows from priceLevels prop
  useEffect(() => {
    setPricing(PRICE_LEVEL_NAMES.map(l => ({ price_level: l, price: 0, break_qty: 1 })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceLevels])

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

  function setF(field: keyof ModalForm, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function openView(p: Product) {
    setActiveProduct(p)
    setModal('view')
    setModalTab('details')
    setError(null)
    setProductOrders([])
    setCustomFieldValues(p.custom_fields ?? {})
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setActiveProduct(null)
    setModal('add')
    setModalTab('details')
    setError(null)
    setCustomFieldValues({})
    setPricing(PRICE_LEVEL_NAMES.map(l => ({ price_level: l, price: 0, break_qty: 1 })))
  }

  function openEdit(p: Product) {
    setForm({
      sku: p.sku ?? '', name: p.name, type: p.type,
      barcode: p.barcode ?? '',
      low_stock_threshold: p.low_stock_threshold != null ? String(p.low_stock_threshold) : '',
      tax_rate: (() => {
        // tax_rate stored as numeric in DB; find matching tax rate id by rate value
        if (!p.tax_rate) return ''
        const stored = Number(p.tax_rate)
        const match = taxRates.find(t => t.rate === stored)
        return match ? match.id : ''
      })(), description: p.description ?? '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      buy_uom: p.buy_uom ?? 'Each',
      buy_uom_qty: p.buy_uom_qty != null ? String(p.buy_uom_qty) : '1',
      sell_price: p.sell_price != null ? String(p.sell_price) : '',
      sell_uom: p.sell_uom ?? 'Each',
      sell_uom_qty: p.sell_uom_qty != null ? String(p.sell_uom_qty) : '1',
      serial_tracking: p.serial_tracking ?? false,
      batch_tracking: p.batch_tracking ?? false,
      expiry_tracking: p.expiry_tracking ?? false,
      default_supplier_id: p.default_supplier_id ?? '',
      supplier_code: p.supplier_code ?? '',
      lead_time_days: p.lead_time_days != null ? String(p.lead_time_days) : '',
      min_order_qty: p.min_order_qty != null ? String(p.min_order_qty) : '',
      notes: p.notes ?? '', is_active: p.is_active ?? true, track_stock: p.track_stock ?? true,
    })
    setActiveProduct(p)
    setModal('edit')
    setModalTab('details')
    setError(null)
    setCustomFieldValues(p.custom_fields ?? {})
    setPricing(PRICE_LEVEL_NAMES.map(l => ({ price_level: l, price: 0, break_qty: 1 })))
  }

  function closeModal() {
    setModal('closed')
    setActiveProduct(null)
    setError(null)
    setCustomFieldValues({})
  }

  async function loadOrders(productId: string) {
    setOrdersLoading(true)
    const res = await fetch(`/api/org/products/${productId}/orders`)
    if (res.ok) setProductOrders(await res.json())
    setOrdersLoading(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Product name is required.'); return }
    if (!form.sku.trim()) { setError('Product # (SKU) is required.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(), sku: form.sku.trim(), type: form.type,
      barcode: form.barcode || null,
      low_stock_threshold: form.low_stock_threshold ? parseInt(form.low_stock_threshold) : null,
      tax_rate: form.tax_rate ? (TAX_OPTIONS.find(t => t.value === form.tax_rate)?.rate ?? null) : null,
      description: form.description || null,
      cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
      buy_uom: form.buy_uom,
      buy_uom_qty: parseInt(form.buy_uom_qty) || 1,
      sell_price: form.sell_price ? parseFloat(form.sell_price) : null,
      sell_uom: form.sell_uom,
      sell_uom_qty: parseInt(form.sell_uom_qty) || 1,
      unit: form.sell_uom,
      serial_tracking: form.serial_tracking,
      batch_tracking: form.batch_tracking,
      expiry_tracking: form.expiry_tracking,
      default_supplier_id: form.default_supplier_id || null,
      supplier_code: form.supplier_code || null,
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      min_order_qty: form.min_order_qty ? parseInt(form.min_order_qty) : null,
      notes: form.notes || null,
      is_active: form.is_active,
      track_stock: form.track_stock,
      custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : null,
    }

    const isEdit = modal === 'edit' && activeProduct
    const url = isEdit ? `/api/org/products/${activeProduct.id}` : '/api/org/products'
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }

    if (isEdit) {
      const updated = { ...activeProduct, ...payload, custom_fields: customFieldValues } as Product
      setProducts(prev => prev.map(p => p.id === activeProduct.id ? updated : p))
      openView(updated)
    } else {
      setProducts(prev => [...prev, { ...payload, id: data.id, last_cost: null, avg_cost: null, custom_fields: customFieldValues } as Product])
      closeModal()
    }
  }

  async function bulkAction(action: 'active' | 'inactive') {
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(id =>
      fetch(`/api/org/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: action === 'active' }),
      })
    ))
    setProducts(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, is_active: action === 'active' } : p))
    setSelectedIds(new Set())
  }

  const stockMap = useMemo(() => {
    const map: Record<string, { onHand: number; onOrder: number; committed: number; available: number }> = {}
    for (const s of stockLevels) {
      if (!map[s.product_id]) map[s.product_id] = { onHand: 0, onOrder: 0, committed: 0, available: 0 }
      map[s.product_id].onHand += s.quantity
      map[s.product_id].onOrder += s.on_order
      map[s.product_id].committed += s.committed
    }
    for (const id in map) {
      map[id].available = map[id].onHand - map[id].committed
    }
    return map
  }, [stockLevels])

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!showInactive && !p.is_active) return false
      if (typeFilter && p.type !== typeFilter) return false
      if (advSupplier && p.default_supplier_id !== advSupplier) return false
      if (advUom && p.sell_uom !== advUom && p.buy_uom !== advUom) return false
      if (advTracking.size > 0) {
        const hasNone = advTracking.has('none')
        const hasSer = advTracking.has('serial')
        const hasBat = advTracking.has('batch')
        const hasExp = advTracking.has('expiry')
        const pNone = !p.serial_tracking && !p.batch_tracking && !p.expiry_tracking
        const match = (hasNone && pNone) || (hasSer && p.serial_tracking) || (hasBat && p.batch_tracking) || (hasExp && p.expiry_tracking)
        if (!match) return false
      }
      const stock = stockMap[p.id]
      const onHand = stock?.onHand ?? 0
      if (tab === 'instock' && onHand <= 0) return false
      if (tab === 'nostock' && onHand > 0) return false
      if (advStock === 'Low Stock' && p.low_stock_threshold && onHand > p.low_stock_threshold) return false
      if (advStock === 'Out of Stock' && onHand > 0) return false
      if (advStock === 'In Stock' && onHand <= 0) return false
      if (search) {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [products, search, typeFilter, tab, showInactive, stockMap, advTracking, advUom, advSupplier, advStock])

  const counts = useMemo(() => ({
    all: products.filter(p => showInactive || p.is_active).length,
    instock: products.filter(p => (showInactive || p.is_active) && (stockMap[p.id]?.onHand ?? 0) > 0).length,
    nostock: products.filter(p => (showInactive || p.is_active) && (stockMap[p.id]?.onHand ?? 0) <= 0).length,
  }), [products, showInactive, stockMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)
  const allPageSelected = paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))

  function toggleAll(checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      paginated.forEach(p => checked ? next.add(p.id) : next.delete(p.id))
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

  const v = visibleCols
  const isView = modal === 'view'
  const curProduct = isView ? activeProduct : null
  const supplierName = (id: string) => suppliers?.find(s => s.id === id)?.name ?? 'Select supplier…'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={() => { setTypeOpen(false); setColOpen(false); setActionsOpen(false); setTaxOpen(false); setSupplierOpen(false) }}>

      <div className="page-header-card">
        <div className="page-header-top">
          <div>
            <div className="page-title">Products</div>
            <div className="page-subtitle">Stock items, non-stock and services</div>
          </div>
          <div className="page-header-actions">
            <div style={{ position: 'relative' }}>
              <button className="btn btn-outline" onClick={e => { e.stopPropagation(); setActionsOpen(o => !o) }}>
                Actions
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {actionsOpen && (
                <div className="inv-dropdown" style={{ display: 'block', minWidth: 200, padding: 6 }} onClick={e => e.stopPropagation()}>
                  <div className="dd-section-label">DATA</div>
                  {canExport && (
                  <div className="dd-item" onClick={() => { setActionsOpen(false); setShowExport(true) }}>
                    <div className="dd-icon-wrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
                    Export Products
                  </div>
                  )}
                  {canImport && (
                  <div className="dd-item" onClick={() => { setActionsOpen(false); setShowImport(true) }}>
                    <div className="dd-icon-wrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                    Import Products
                  </div>
                  )}
                  <div className="dd-sep" />
                  <div className="dd-section-label">STOCK</div>
                  <div className="dd-item" onClick={() => { setActionsOpen(false); router.push('/products/adjustments') }}>
                    <div className="dd-icon-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </div>
                    Stock Adjustments
                  </div>
                  <div className="dd-item" onClick={() => { setActionsOpen(false); router.push('/products/movements') }}>
                    <div className="dd-icon-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    </div>
                    Stock Movement
                  </div>
                </div>
              )}
            </div>
              {canCreate && (
              <button className="btn btn-primary" onClick={openAdd}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Product
              </button>
              )}
          </div>
        </div>
        <div className="tab-bar">
          {([{ key: 'all', label: 'All' }, { key: 'instock', label: 'In Stock' }, { key: 'nostock', label: 'No Stock' }] as const).map(t => (
            <div key={t.key} className={`tab-item${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setPage(1) }}>
              {t.label}<span className="tab-count">{counts[t.key]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="filter-bar-card" onClick={e => e.stopPropagation()}>
        <div className="filter-search-wrap">
          <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="filter-search" placeholder="Search products…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div style={{ position: 'relative' }}>
          <button className={`filter-dd-btn${typeFilter ? ' active-filter' : ''}`} onClick={() => setTypeOpen(o => !o)}>
            <span>{typeFilter === 'NonStock' ? 'Non Stock' : typeFilter || 'All Types'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeOpen && (
            <div className="inv-dropdown" style={{ display: 'block', minWidth: 160 }}>
              <div className="col-dropdown-title">Type</div>
              {[{ val: '', label: 'All Types' }, { val: 'Stock', label: 'Stock' }, { val: 'NonStock', label: 'Non Stock' }, { val: 'Service', label: 'Service' }].map(({ val, label }) => (
                <div key={val} className={`fp-item${typeFilter === val ? ' active' : ''}`} onClick={() => { setTypeFilter(val); setPage(1); setTypeOpen(false) }}>{label}</div>
              ))}
            </div>
          )}
        </div>
        <button className={`filter-btn${advOpen ? ' active' : ''}`} onClick={() => setAdvOpen(o => !o)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Advanced{(advTracking.size > 0 || advUom || advSupplier || advStock) ? ' •' : ''}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-400)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showInactive} onChange={e => { setShowInactive(e.target.checked); setPage(1) }} style={{ accentColor: 'var(--teal)', cursor: 'pointer', width: 14, height: 14 }} />
          Show inactive
        </label>
        <div className="filter-spacer" />
        <div style={{ position: 'relative' }}>
          <button className="col-selector-btn" onClick={() => setColOpen(o => !o)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Columns
          </button>
          {colOpen && (
            <div className="inv-dropdown col-dropdown" style={{ display: 'block' }}>
              <div className="col-dropdown-title">Show / Hide Columns</div>
              {COLS.filter(col => canViewPricing || !['sell_price', 'cost_price'].includes(col.key)).map(col => (
                <label key={col.key} className="col-check-item">
                  <input type="checkbox" checked={v.has(col.key)} onChange={e => {
                    setVisibleCols(prev => {
                      const next = new Set(prev)
                      e.target.checked ? next.add(col.key) : next.delete(col.key)
                      try { localStorage.setItem('products-visible-cols', JSON.stringify([...next])) } catch {}
                      return next
                    })
                  }} style={{ accentColor: 'var(--teal)', width: 14, height: 14, cursor: 'pointer' }} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

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
            {/* Tracking — multi-select checkboxes */}
            <div className="adv-field">
              <label>Tracking</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                {[{ key: 'serial', label: 'Serial' }, { key: 'batch', label: 'Batch / Lot' }, { key: 'expiry', label: 'Expiry Date' }, { key: 'none', label: 'No Tracking' }].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--slate)', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={advTracking.has(key)} onChange={e => {
                      setAdvTracking(prev => { const next = new Set(prev); e.target.checked ? next.add(key) : next.delete(key); return next })
                    }} style={{ accentColor: 'var(--teal)', width: 14, height: 14, cursor: 'pointer' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {/* UOM */}
            {UOM_LIST.length > 0 && (
              <div className="adv-field">
                <label>UOM</label>
                <select className="adv-input" value={advUom} onChange={e => setAdvUom(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="">Any</option>
                  {UOM_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
            {suppliers && suppliers.length > 0 && (
              <div className="adv-field">
                <label>Supplier</label>
                <select className="adv-input" value={advSupplier} onChange={e => setAdvSupplier(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="">Any</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="adv-field">
              <label>Stock Status</label>
              <select className="adv-input" value={advStock} onChange={e => setAdvStock(e.target.value)} style={{ cursor: 'pointer' }}>
                <option value="">Any</option>
                {['In Stock', 'Out of Stock', 'Low Stock'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="adv-filter-actions">
            <button className="btn-sm btn-sm-primary" onClick={() => setAdvOpen(false)}>Apply</button>
            <button className="btn-sm btn-sm-ghost" onClick={() => { setAdvTracking(new Set()); setAdvUom(''); setAdvSupplier(''); setAdvStock('') }}>Clear all</button>
          </div>
        </div>
      )}

      <div className="table-container">
        <div className="table-toolbar">
          {selectedIds.size > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)' }}>{selectedIds.size} selected</span>
              <div style={{ width: 1, height: 18, background: 'var(--gray-200)', margin: '0 4px' }} />
              <button className="btn-sm btn-sm-primary" onClick={() => bulkAction('active')}>Set Active</button>
              <button className="btn-sm btn-sm-ghost" onClick={() => bulkAction('inactive')}>Set Inactive</button>
              <button className="btn-sm btn-sm-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelectedIds(new Set())}>✕ Clear</button>
            </div>
          ) : (
            <span className="table-count"><strong>{filtered.length}</strong> products</span>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={e => toggleAll(e.target.checked)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                </th>
                <th className="sortable">Product</th>
                {v.has('type') && <th>Type</th>}
                {v.has('status') && <th>Status</th>}
                {v.has('unit') && <th>Unit</th>}
                {v.has('barcode') && <th>Barcode</th>}
                {canViewPricing && v.has('sell_price') && <th style={{ textAlign: 'right' }}>Sale Price</th>}
                {canViewPricing && v.has('cost_price') && <th style={{ textAlign: 'right' }}>Cost Price</th>}
                {v.has('on_hand') && <th style={{ textAlign: 'right' }}>On Hand</th>}
                {v.has('on_order') && <th style={{ textAlign: 'right' }}>On Order</th>}
                {v.has('committed') && <th style={{ textAlign: 'right' }}>Committed</th>}
                {v.has('available') && <th style={{ textAlign: 'right' }}>Available</th>}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                    {search ? 'No products match your search.' : 'No products yet. Add one to get started.'}
                  </td>
                </tr>
              )}
              {paginated.map(p => {
                const stock = stockMap[p.id] ?? { onHand: 0, onOrder: 0, committed: 0, available: 0 }
                return (
                  <tr key={p.id} onClick={() => openView(p)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleOne(p.id)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
                    </td>
                    <td>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--slate)', letterSpacing: '-0.01em' }}>{p.name}</div>
                      {p.sku && <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'monospace', marginTop: 1 }}>{p.sku}</div>}
                    </td>
                    {v.has('type') && <td>{typeBadge(p.type)}</td>}
                    {v.has('status') && <td>{p.is_active ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46' }}>Active</span> : <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>Inactive</span>}</td>}
                    {v.has('unit') && <td className="td-muted">{p.unit ?? '—'}</td>}
                    {v.has('barcode') && <td className="td-mono">{p.barcode ?? '—'}</td>}
                    {canViewPricing && v.has('sell_price') && <td style={{ textAlign: 'right' }} className="td-muted">{fmt(p.sell_price, dp)}</td>}
                    {canViewPricing && v.has('cost_price') && <td style={{ textAlign: 'right' }} className="td-muted">{fmt(p.cost_price, dp)}</td>}
                    {v.has('on_hand') && <td style={{ textAlign: 'right' }}>{p.track_stock ? <span style={{ fontWeight: 600, color: stock.onHand <= 0 ? 'var(--danger)' : 'var(--slate)' }}>{stock.onHand}</span> : <span className="td-muted">—</span>}</td>}
                    {v.has('on_order') && <td style={{ textAlign: 'right' }} className="td-muted">{p.track_stock ? stock.onOrder : '—'}</td>}
                    {v.has('committed') && <td style={{ textAlign: 'right' }} className="td-muted">{p.track_stock ? stock.committed : '—'}</td>}
                    {v.has('available') && <td style={{ textAlign: 'right' }}>{p.track_stock ? <span style={{ fontWeight: 600, color: stock.available <= 0 ? 'var(--danger)' : '#059669' }}>{stock.available}</span> : <span className="td-muted">—</span>}</td>}
                    {canEdit && (
                    <td>
                      <div className="row-actions">
                        <button className="row-action-btn" onClick={e => { e.stopPropagation(); openEdit(p) }} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </div>
                    </td>
                    )}
                  </tr>
                )
              })}
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

      {modal !== 'closed' && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal-box" style={{ maxWidth: 780 }} onMouseDown={e => e.stopPropagation()} onClick={() => { setTaxOpen(false); setSupplierOpen(false) }}>

            <div className="modal-header">
              <div>
                <div className="modal-title">{isView ? curProduct?.name : modal === 'edit' ? 'Edit Product' : 'Add Product'}</div>
                <div className="modal-subtitle">{isView ? `${curProduct?.type} · ${curProduct?.is_active ? 'Active' : 'Inactive'}` : modal === 'edit' ? 'Update product details' : 'Fill in the product details'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--gray-400)', fontFamily: 'var(--font-ui)' }}>Status</span>
                <Toggle active={isView ? (curProduct?.is_active ?? true) : form.is_active} onChange={val => setF('is_active', val)} disabled={isView} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font-ui)' }}>
                  {(isView ? curProduct?.is_active : form.is_active) ? 'Active' : 'Inactive'}
                </span>
                <div style={{ width: 1, height: 20, background: 'var(--gray-100)', margin: '0 4px' }} />
                {isView && canEdit && (
                  <button className="btn btn-outline" style={{ height: 32 }} onClick={() => activeProduct && openEdit(activeProduct)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Product
                  </button>
                )}
                <button className="modal-close" onClick={closeModal}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="modal-tab-bar">
              {(['details', 'pricing', 'custom', 'stock', 'orders'] as const)
                .filter(t => {
                  if (t === 'stock' || t === 'orders') return isView
                  if (t === 'custom') return customFields.length > 0 || customLists.length > 0
                  if (t === 'pricing') return canViewPricing
                  return true
                })
                .map(t => (
                <div key={t} className={`modal-tab${modalTab === t ? ' active' : ''}`} onClick={() => {
                  setModalTab(t)
                  if (t === 'orders' && activeProduct && productOrders.length === 0) loadOrders(activeProduct.id)
                }}>
                  {t === 'details' ? 'Details' : t === 'pricing' ? 'Price Levels' : t === 'stock' ? 'Stock Details' : t === 'orders' ? 'Orders' : 'Custom Fields'}
                </div>
              ))}
            </div>

            <div className="modal-body">

              {modalTab === 'details' && (
                <>
                  <Section title="Product Details">
                    <div className="modal-grid-3">
                      <Field label="Product #" hint="*">
                        <MInput value={isView ? (curProduct?.sku ?? '') : form.sku} onChange={val => setF('sku', val)} placeholder="e.g. PRD-001" disabled={isView} />
                      </Field>
                      <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                        <label className="modal-label">Product Name <span className="req">*</span></label>
                        <MInput value={isView ? (curProduct?.name ?? '') : form.name} onChange={val => setF('name', val)} placeholder="e.g. Wireless Headphones Pro" disabled={isView} />
                      </div>
                    </div>
                    <div className="modal-grid-2">
                      <Field label="Product Type">
                        {isView ? typeBadge(curProduct?.type ?? 'Stock') : (
                          <div className="modal-seg">
                            {['Stock', 'NonStock', 'Service'].map(t => (
                              <button key={t} type="button" className={`seg-btn${form.type === t ? ' active' : ''}`} onClick={() => setF('type', t)}>{t === 'NonStock' ? 'Non Stock' : t}</button>
                            ))}
                          </div>
                        )}
                      </Field>
                    </div>
                    <div className="modal-grid-2">
                      <Field label="Barcode">
                        <MInput value={isView ? (curProduct?.barcode ?? '') : form.barcode} onChange={val => setF('barcode', val)} placeholder="e.g. 9300675000959" disabled={isView} mono />
                      </Field>
                      <Field label="Min Stock Alert" hint="— alert below this qty">
                        <MInput value={isView ? String(curProduct?.low_stock_threshold ?? '') : form.low_stock_threshold} onChange={val => setF('low_stock_threshold', val)} type="number" placeholder="e.g. 5" disabled={isView} />
                      </Field>
                    </div>
                    <Field label="Tax Rate">
                      {isView ? (
                        <MInput value={(() => {
                          const stored = Number(curProduct?.tax_rate)
                          const match = TAX_OPTIONS.find(t => t.rate === stored && t.value !== '')
                          return match ? match.label : 'No Tax (0%)'
                        })()} disabled />
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <button className="modal-dd-btn" onClick={e => { e.stopPropagation(); setTaxOpen(o => !o) }} type="button">
                            <span>{form.tax_rate ? TAX_OPTIONS.find(t => t.value === form.tax_rate)?.label : 'Select tax rate…'}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          {taxOpen && (
                            <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 220 }}>
                              <div className="col-dropdown-title">Tax Rate</div>
                              {TAX_OPTIONS.map(opt => (
                                <div key={opt.value} className={`fp-item${form.tax_rate === opt.value ? ' active' : ''}`} onClick={() => { setF('tax_rate', opt.value); setTaxOpen(false) }}>{opt.label}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Field>
                    <Field label="Description">
                      <textarea className="modal-input" value={isView ? (curProduct?.description ?? '') : form.description} onChange={e => setF('description', e.target.value)} placeholder="Short product description…" rows={2} disabled={isView} style={{ resize: 'vertical', height: 56, lineHeight: 1.5, opacity: isView ? 0.7 : 1 }} />
                    </Field>
                  </Section>

                  <Section title="Buying Details">
                    <div className="modal-grid-2">
                      {canViewPricing && (
                      <Field label="Cost Price (Buy)">
                        <MInput value={isView ? String(curProduct?.cost_price ?? '') : form.cost_price} onChange={val => setF('cost_price', val)} onBlur={val => { if (val && !isView) setF('cost_price', Number(val).toFixed(dp)) }} type="number" placeholder={Number(0).toFixed(dp)} prefix="$" disabled={isView} />
                      </Field>
                      )}
                      <Field label="Buy UOM">
                        <UomSelect value={isView ? (curProduct?.buy_uom ?? 'Each') : form.buy_uom} onChange={val => setF('buy_uom', val)} disabled={isView} label="Buy UOM" options={UOM_LIST} />
                      </Field>
                    </div>
                    <div className="modal-grid-2">
                      <Field label="Units per Buy UOM" hint="e.g. 24 if 1 Carton = 24 Each">
                        <MInput value={isView ? String(curProduct?.buy_uom_qty ?? 1) : form.buy_uom_qty} onChange={val => setF('buy_uom_qty', val)} type="number" placeholder="1" disabled={isView} />
                      </Field>
                    </div>
                    {(() => {
                      const buyQty = isView ? (curProduct?.buy_uom_qty ?? 1) : parseInt(form.buy_uom_qty) || 1
                      const buyUom = isView ? (curProduct?.buy_uom ?? 'Each') : form.buy_uom
                      const sellUom = isView ? (curProduct?.sell_uom ?? 'Each') : form.sell_uom
                      if (buyQty > 1) return (
                        <div style={{ background: 'var(--teal-surface)', border: '1px solid var(--teal-pale)', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          1 {buyUom} = {buyQty} {sellUom} / Receiving 1 {buyUom} will add {buyQty} {sellUom} to stock
                        </div>
                      )
                      return null
                    })()}
                    {canViewPricing && (modal === 'edit' || isView) && activeProduct && (
                      <div className="modal-grid-2">
                        <Field label="Last Cost" hint="(most recent PO)">
                          <div className="modal-input" style={{ background: 'var(--gray-50)', color: 'var(--gray-400)', cursor: 'default' }}>{activeProduct.last_cost ? `$${Number(activeProduct.last_cost).toFixed(dp)}` : '—'}</div>
                        </Field>
                        <Field label="Average Cost" hint="(weighted avg)">
                          <div className="modal-input" style={{ background: 'var(--gray-50)', color: 'var(--gray-400)', cursor: 'default' }}>{activeProduct.avg_cost ? `$${Number(activeProduct.avg_cost).toFixed(dp)}` : '—'}</div>
                        </Field>
                      </div>
                    )}
                  </Section>

                  <Section title="Selling Details">
                    <div className="modal-grid-2">
                      {canViewPricing && (
                      <Field label="Unit Price (Sell)">
                        <MInput value={isView ? String(curProduct?.sell_price ?? '') : form.sell_price} onChange={val => setF('sell_price', val)} onBlur={val => { if (val && !isView) setF('sell_price', Number(val).toFixed(dp)) }} type="number" placeholder={Number(0).toFixed(dp)} prefix="$" disabled={isView} />
                      </Field>
                      )}
                      <Field label="Sell UOM">
                        <UomSelect value={isView ? (curProduct?.sell_uom ?? 'Each') : form.sell_uom} onChange={val => setF('sell_uom', val)} disabled={isView} label="Sell UOM" options={UOM_LIST} />
                      </Field>
                    </div>
                    <div className="modal-grid-2">
                      <Field label="Units per Sell UOM" hint="usually 1">
                        <MInput value={isView ? String(curProduct?.sell_uom_qty ?? 1) : form.sell_uom_qty} onChange={val => setF('sell_uom_qty', val)} type="number" placeholder="1" disabled={isView} />
                      </Field>
                    </div>
                  </Section>

                  {trackingOptions.length > 0 && (
                  <Section title="Tracking">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {trackingOptions.map(({ key, label, sub }) => (
                        <div key={key} className="pm-toggle-row">
                          <div>
                            <div className="pm-toggle-lbl">{label}</div>
                            <div className="pm-toggle-sub">{sub}</div>
                          </div>
                          <Toggle
                            active={isView ? !!(curProduct as Record<string, unknown>)?.[key] : form[key] as boolean}
                            onChange={val => setF(key, val)}
                            disabled={isView}
                          />
                        </div>
                      ))}
                    </div>
                  </Section>
                  )}

                  <Section title="Supplier">
                    <div className="modal-grid-2">
                      <Field label="Supplier">
                        {isView ? (
                          <MInput value={curProduct?.default_supplier_id ? supplierName(curProduct.default_supplier_id) : 'None'} disabled />
                        ) : (
                          <div style={{ position: 'relative' }}>
                            <button className="modal-dd-btn" onClick={e => { e.stopPropagation(); setSupplierOpen(o => !o) }} type="button">
                              <span>{form.default_supplier_id ? supplierName(form.default_supplier_id) : 'Select supplier…'}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            {supplierOpen && (
                              <div className="inv-dropdown filter-pick-dropdown" style={{ display: 'block', minWidth: 260 }}>
                                <div className="col-dropdown-title">Supplier Contacts</div>
                                <div className={`fp-item${!form.default_supplier_id ? ' active' : ''}`} onClick={() => { setF('default_supplier_id', ''); setSupplierOpen(false) }}>None</div>
                                {(suppliers ?? []).map(s => (
                                  <div key={s.id} className={`fp-item${form.default_supplier_id === s.id ? ' active' : ''}`} onClick={() => { setF('default_supplier_id', s.id); setSupplierOpen(false) }}>{s.name}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Field>
                      <Field label="Supplier / Product Code">
                        <MInput value={isView ? (curProduct?.supplier_code ?? '') : form.supplier_code} onChange={val => setF('supplier_code', val)} placeholder="Supplier's SKU or part #" disabled={isView} />
                      </Field>
                    </div>
                    <div className="modal-grid-2">
                      <Field label="Lead Time (days)">
                        <MInput value={isView ? String(curProduct?.lead_time_days ?? '') : form.lead_time_days} onChange={val => setF('lead_time_days', val)} type="number" placeholder="e.g. 7" disabled={isView} />
                      </Field>
                      <Field label="Min Order Qty">
                        <MInput value={isView ? String(curProduct?.min_order_qty ?? '') : form.min_order_qty} onChange={val => setF('min_order_qty', val)} type="number" placeholder="e.g. 10" disabled={isView} />
                      </Field>
                    </div>
                  </Section>

                  <div className="pm-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <div className="pm-section-hd">Notes</div>
                    <textarea className="modal-input" value={isView ? (curProduct?.notes ?? '') : form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Internal notes about this product…" rows={3} disabled={isView} style={{ resize: 'vertical', height: 80, lineHeight: 1.6, opacity: isView ? 0.7 : 1 }} />
                  </div>
                </>
              )}

              {modalTab === 'pricing' && (
                <>
                  <div style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '50%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '25%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: 'var(--gray-50)' }}>
                          <th className="li-th" style={{ textAlign: 'left' }}>Price Level</th>
                          <th className="li-th" style={{ textAlign: 'right' }}>Price</th>
                          <th className="li-th" style={{ textAlign: 'right' }}>Break Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricing.map((row, i) => (
                          <tr key={row.price_level} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td className="li-td" style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{row.price_level}</td>
                            <td className="li-td" style={{ textAlign: 'right', paddingRight: 8 }}>
                              <input className="li-input right" type="number" step={priceStep} value={row.price || ''} onChange={e => { const a = [...pricing]; a[i].price = parseFloat(e.target.value) || 0; setPricing(a) }} placeholder={Number(0).toFixed(dp)} disabled={isView} style={{ textAlign: 'right', width: '100%', maxWidth: 120 }} />
                            </td>
                            <td className="li-td" style={{ textAlign: 'right', paddingRight: 8 }}>
                              <input className="li-input right" type="number" step="1" value={row.break_qty || ''} onChange={e => { const a = [...pricing]; a[i].break_qty = parseInt(e.target.value) || 1; setPricing(a) }} placeholder="1" disabled={isView} style={{ textAlign: 'right', width: '100%', maxWidth: 80 }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ background: 'var(--teal-surface)', border: '1px solid var(--teal-pale)', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Price levels are configured in Settings → Products. Set the price and break qty for each level here.
                  </div>
                </>
              )}

              {modalTab === 'stock' && (
                <div>
                  {locations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-400)', fontSize: 13, background: 'var(--gray-50)', borderRadius: 12 }}>No locations configured for this organisation.</div>
                  ) : (
                    <div style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--gray-50)' }}>
                            <th className="li-th">Location</th>
                            <th className="li-th" style={{ textAlign: 'right' }}>On Hand</th>
                            <th className="li-th" style={{ textAlign: 'right' }}>On Order</th>
                            <th className="li-th" style={{ textAlign: 'right' }}>Committed</th>
                            <th className="li-th" style={{ textAlign: 'right' }}>Available</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locations.map(loc => {
                            const s = stockLevels.find(sl => sl.product_id === activeProduct?.id && sl.location_id === loc.id)
                            const onHand = s?.quantity ?? 0
                            const onOrder = s?.on_order ?? 0
                            const committed = s?.committed ?? 0
                            const available = onHand - committed
                            return (
                              <tr key={loc.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                                <td className="li-td" style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 13 }}>{loc.name}</td>
                                <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: onHand <= 0 ? 'var(--danger)' : 'var(--slate)' }}>{onHand}</td>
                                <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{onOrder}</td>
                                <td className="li-td" style={{ textAlign: 'right', color: 'var(--gray-400)' }}>{committed}</td>
                                <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: available <= 0 ? 'var(--danger)' : '#059669' }}>{available}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {modalTab === 'orders' && (
                <div>
                  {ordersLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: 13 }}>Loading…</div>
                  ) : productOrders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-400)', fontSize: 13, background: 'var(--gray-50)', borderRadius: 12 }}>No orders found for this product.</div>
                  ) : (
                    <div style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--gray-50)' }}>
                            <th className="li-th">Order #</th>
                            <th className="li-th">Type</th>
                            <th className="li-th">Date</th>
                            <th className="li-th">Status</th>
                            <th className="li-th" style={{ textAlign: 'right' }}>Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productOrders.map((o: Record<string, unknown>) => (
                            <tr key={o.id as string} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                              <td className="li-td" style={{ fontWeight: 600, color: 'var(--slate)' }}>{(o.order_number ?? '—') as string}</td>
                              <td className="li-td"><span className="badge badge-draft">{(o.order_type ?? '—') as string}</span></td>
                              <td className="li-td" style={{ color: 'var(--gray-400)' }}>{o.order_date ? new Date(o.order_date as string).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                              <td className="li-td"><span className="badge badge-draft">{(o.status ?? '—') as string}</span></td>
                              <td className="li-td" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--slate)' }}>{(o.quantity ?? '—') as string | number}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {modalTab === 'custom' && (
                <>
                  {customFields.length === 0 && customLists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ fontSize: 13.5, color: 'var(--gray-400)', lineHeight: 1.6 }}>
                        No custom fields configured yet.<br />
                        Go to <strong style={{ color: 'var(--teal)' }}>Settings → Products</strong> to add some.
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
                                onClick={() => !isView && setCustomFieldValues(prev => ({ ...prev, [cf.id]: customFieldValues[cf.id] === 'true' ? 'false' : 'true' }))}
                                type="button"
                                disabled={isView}
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
                              disabled={isView}
                              style={{ opacity: isView ? 0.7 : 1 }}
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
                            disabled={isView}
                            style={{ cursor: isView ? 'default' : 'pointer', opacity: isView ? 0.7 : 1 }}
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

              {error && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#B91C1C' }}>{error}</div>
              )}
            </div>

            <div className="modal-footer">
              {isView ? (
                <button className="btn btn-outline" onClick={closeModal}>Close</button>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Product'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Export Modal ── */}
      {showExport && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowExport(false) }}>
          <div className="modal-box" style={{ maxWidth: 440 }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Export Products</div>
                <div className="modal-subtitle">Download all products as a CSV file.</div>
              </div>
              <button className="modal-close" onClick={() => setShowExport(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <ExportModal products={products} customFields={customFields} decimalPlaces={dp} taxRates={taxRates} priceLevels={priceLevels} orgId={orgId} onClose={() => setShowExport(false)} />
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowImport(false) }}>
          <div className="modal-box" style={{ maxWidth: 500 }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Import Products</div>
                <div className="modal-subtitle">Upload a CSV file to import products.</div>
              </div>
              <button className="modal-close" onClick={() => setShowImport(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <ImportModal
              orgId={orgId}
              customFields={customFields}
              customLists={customLists}
              taxRates={taxRates}
              suppliers={suppliers ?? []}
              priceLevels={priceLevels}
              uoms={uoms}
              onClose={() => setShowImport(false)}
              onImported={(newProds) => setProducts(prev => [...prev, ...(newProds as Product[])])}
            />
          </div>
        </div>
      )}

      <style>{`
        .pm-section { padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--gray-100); display: flex; flex-direction: column; gap: 12px; }
        .pm-section-hd { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gray-400); font-family: var(--font-ui); }
        .pm-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--gray-50); border: 1.5px solid var(--gray-100); border-radius: 9px; }
        .pm-toggle-lbl { font-size: 13px; font-weight: 600; color: var(--slate); }
        .pm-toggle-sub { font-size: 12px; color: var(--gray-400); margin-top: 1px; }
      `}</style>
    </div>
  )
}
