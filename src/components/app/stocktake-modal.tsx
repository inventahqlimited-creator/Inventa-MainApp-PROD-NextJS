'use client'
// src/components/app/stocktake-modal.tsx

import { useRef, useState } from 'react'

type Product = {
  id: string
  name: string
  sku: string | null
  sell_uom: string | null
  track_stock: boolean | null
  serial_tracking: boolean | null
  batch_tracking: boolean | null
  expiry_tracking: boolean | null
}

type Location = {
  id: string
  name: string
}

type ParsedRow = {
  product_id: string
  product_name: string
  sku: string
  location_id: string | null
  quantity: number
  batch_number: string | null
  serial_number: string | null
  expiry_date: string | null
  serial_tracking: boolean
  batch_tracking: boolean
  expiry_tracking: boolean
}

export default function StocktakeModal({
  orgId,
  products,
  locations,
  onClose,
  onImported,
}: {
  orgId: string
  products: Product[]
  locations: Location[]
  onClose: () => void
  onImported: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [imported, setImported] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadStocktake() {
    const a = document.createElement('a')
    a.href = '/api/org/stocktake'
    a.download = `stocktake-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  function parseRow(line: string): string[] {
    const result: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
      else { cur += ch }
    }
    result.push(cur)
    return result
  }

  async function doImport() {
    if (!file) return
    setImporting(true)
    setErrors([])

    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      setErrors(['File is empty or has no data rows.'])
      setImporting(false)
      return
    }

    const rawHeaders = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())

    const nameIdx = rawHeaders.findIndex(h => h === 'product name' || h.includes('product name'))
    const skuIdx = rawHeaders.findIndex(h => h === 'sku')
    const locationIdx = rawHeaders.findIndex(h => h === 'location')
    const qtyIdx = rawHeaders.findIndex(h => h === 'quantity')
    const batchIdx = rawHeaders.findIndex(h => h === 'batch number' || h.includes('batch'))
    const serialIdx = rawHeaders.findIndex(h => h === 'serial number' || h.includes('serial'))
    const expiryIdx = rawHeaders.findIndex(h => h === 'expiry date' || h.includes('expiry'))

    if (qtyIdx < 0) {
      setErrors(['Missing required column: Quantity'])
      setImporting(false)
      return
    }
    if (nameIdx < 0 && skuIdx < 0) {
      setErrors(['Missing required column: Product Name or SKU'])
      setImporting(false)
      return
    }

    // Build lookup maps
    const productByName = new Map(products.map(p => [p.name.toLowerCase().trim(), p]))
    const productBySku = new Map(products.filter(p => p.sku).map(p => [p.sku!.toLowerCase().trim(), p]))
    const locationByName = new Map(locations.map(l => [l.name.toLowerCase().trim(), l]))

    const rowErrors: string[] = []
    const parsedRows: ParsedRow[] = []
    const dataRows = lines.slice(1)

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2
      const cols = parseRow(dataRows[i])
      const get = (idx: number) => (idx >= 0 ? (cols[idx] ?? '').trim() : '')

      const nameVal = get(nameIdx)
      const skuVal = get(skuIdx)
      const locationVal = get(locationIdx)
      const qtyVal = get(qtyIdx)
      const batchVal = get(batchIdx)
      const serialVal = get(serialIdx)
      const expiryVal = get(expiryIdx)

      // Resolve product
      let product: Product | undefined
      if (skuVal) product = productBySku.get(skuVal.toLowerCase())
      if (!product && nameVal) product = productByName.get(nameVal.toLowerCase())

      if (!product) {
        rowErrors.push(`Row ${rowNum}: Product "${nameVal || skuVal}" not found`)
        continue
      }

      // Validate quantity
      const qty = parseFloat(qtyVal)
      if (isNaN(qty) || qty < 0) {
        rowErrors.push(`Row ${rowNum} (${product.name}): Invalid quantity "${qtyVal}"`)
        continue
      }

      // Resolve location
      let locationId: string | null = null
      if (locationVal) {
        const loc = locationByName.get(locationVal.toLowerCase())
        if (!loc) {
          rowErrors.push(`Row ${rowNum} (${product.name}): Location "${locationVal}" not found`)
          continue
        }
        locationId = loc.id
      }

      // Tracking validation: error only if tracking is ON and field is missing
      if (product.serial_tracking && !serialVal) {
        rowErrors.push(`Row ${rowNum} (${product.name}): Serial number is required (serial tracking is enabled)`)
        continue
      }
      if (product.batch_tracking && !batchVal) {
        rowErrors.push(`Row ${rowNum} (${product.name}): Batch number is required (batch tracking is enabled)`)
        continue
      }
      if (product.expiry_tracking && !expiryVal) {
        rowErrors.push(`Row ${rowNum} (${product.name}): Expiry date is required (expiry tracking is enabled)`)
        continue
      }

      parsedRows.push({
        product_id: product.id,
        product_name: product.name,
        sku: product.sku ?? '',
        location_id: locationId,
        quantity: qty,
        // Silently ignore tracking fields if tracking is off
        batch_number: product.batch_tracking ? (batchVal || null) : null,
        serial_number: product.serial_tracking ? (serialVal || null) : null,
        expiry_date: product.expiry_tracking ? (expiryVal || null) : null,
        serial_tracking: !!product.serial_tracking,
        batch_tracking: !!product.batch_tracking,
        expiry_tracking: !!product.expiry_tracking,
      })
    }

    // All-or-nothing: if any errors, stop
    if (rowErrors.length > 0) {
      setErrors(rowErrors)
      setImporting(false)
      return
    }

    // POST to API
    const res = await fetch('/api/org/stocktake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: parsedRows }),
    })

    setImporting(false)

    if (!res.ok) {
      let msg = 'Import failed. Please try again.'
      try { const b = await res.json(); msg = b?.error ?? msg } catch { /* */ }
      setErrors([msg])
      return
    }

    setImported(parsedRows.length)
    onImported()
  }

  if (imported !== null) {
    return (
      <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Stocktake Applied</div>
        <div style={{ fontSize: 13.5, color: 'var(--gray-400)', marginBottom: 20 }}>
          {imported} row{imported !== 1 ? 's' : ''} updated successfully.
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
        onDrop={e => {
          e.preventDefault(); setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f?.name.endsWith('.csv')) setFile(f)
        }}
        onClick={() => fileRef.current?.click()}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate)', marginTop: 10 }}>Drop CSV file here</div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
          or <span style={{ color: 'var(--teal)', textDecoration: 'underline', cursor: 'pointer' }}>browse</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 6 }}>{file ? file.name : 'No file selected'}</div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
      </div>

      <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 9, padding: '10px 14px', marginTop: 14, fontSize: 12.5, color: 'var(--gray-400)' }}>
        Download the full stocktake file as a starting point — then delete any rows you don't need, edit quantities, or add new rows for new lots.{' '}
        <span
          style={{ color: 'var(--teal)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 500 }}
          onClick={downloadStocktake}
        >
          Download Stocktake File
        </span>
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
