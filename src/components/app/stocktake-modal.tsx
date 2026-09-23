'use client'
// src/components/app/stocktake-modal.tsx

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

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

export default function StocktakeModal({
  orgId,
  products,
  locations,
  onClose,
}: {
  orgId: string
  products: Product[]
  locations: Location[]
  onClose: () => void
  onImported?: () => void
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadStocktake() {
    const a = document.createElement('a')
    a.href = '/api/org/stocktake'
    a.download = `stocktake-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  function parseRow(line: string): string[] {
    const result: string[] = []
    let cur = '', i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            cur += '"'; i += 2
          } else if (line[i] === '"') {
            i++ // closing quote
            break
          } else {
            cur += line[i++]
          }
        }
        while (i < line.length && line[i] !== ',') i++
      } else if (line[i] === ',') {
        result.push(cur); cur = ''; i++
      } else {
        cur += line[i++]
      }
    }
    result.push(cur)
    return result
  }

  async function doImport() {
    if (!file) return
    setParsing(true)
    setErrors([])

    const text = await file.text()
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(Boolean)

    if (lines.length < 2) {
      setErrors(['File is empty or has no data rows.'])
      setParsing(false)
      return
    }

    const rawHeaders = parseRow(lines[0]).map(h => h.replace(/^﻿/, '').trim().toLowerCase())

    const nameIdx     = rawHeaders.findIndex(h => h === 'product name' || h.includes('product name'))
    const skuIdx      = rawHeaders.findIndex(h => h === 'sku')
    const locationIdx = rawHeaders.findIndex(h => h === 'location')
    const qtyIdx      = rawHeaders.findIndex(h => h === 'quantity')
    const batchIdx    = rawHeaders.findIndex(h => h === 'batch number' || h.includes('batch'))
    const serialIdx   = rawHeaders.findIndex(h => h === 'serial number' || h.includes('serial'))
    const expiryIdx   = rawHeaders.findIndex(h => h === 'expiry date' || h.includes('expiry'))

    if (qtyIdx < 0) {
      setErrors(['Missing required column: Quantity'])
      setParsing(false)
      return
    }
    if (nameIdx < 0 && skuIdx < 0) {
      setErrors(['Missing required column: Product Name or SKU'])
      setParsing(false)
      return
    }

    const productByName = new Map(products.map(p => [p.name.toLowerCase().trim(), p]))
    const productBySku  = new Map(products.filter(p => p.sku).map(p => [p.sku!.toLowerCase().trim(), p]))
    const locationByName = new Map(locations.map(l => [l.name.toLowerCase().trim(), l]))

    const rowErrors: string[] = []
    const parsedLines: {
      product: Product
      location_id: string | null
      location_name: string | null
      quantity: number
      batch_number: string
      serial_number: string
      expiry_date: string
    }[] = []

    const locationsUsed = new Set<string>()

    const dataRows = lines.slice(1)

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2
      const cols = parseRow(dataRows[i])
      const get = (idx: number) => (idx >= 0 ? (cols[idx] ?? '').trim() : '')

      const nameVal     = get(nameIdx)
      const skuVal      = get(skuIdx)
      const locationVal = get(locationIdx)
      const qtyVal      = get(qtyIdx)
      const batchVal    = get(batchIdx)
      const serialVal   = get(serialIdx)
      const expiryVal   = get(expiryIdx)

      // Skip blank rows (e.g. trailing empty rows from Excel)
      if (!nameVal && !skuVal && !qtyVal) continue

      // Resolve product
      let product: Product | undefined
      if (skuVal) product = productBySku.get(skuVal.toLowerCase())
      if (!product && nameVal) product = productByName.get(nameVal.toLowerCase())

      if (!product) {
        const label = nameVal || skuVal
        rowErrors.push(`Row ${rowNum}: Product "${label}" not found`)
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
      let locationName: string | null = null
      if (locationVal) {
        const loc = locationByName.get(locationVal.toLowerCase())
        if (!loc) {
          rowErrors.push(`Row ${rowNum} (${product.name}): Location "${locationVal}" not found`)
          continue
        }
        locationId = loc.id
        locationName = loc.name
        locationsUsed.add(loc.id)
      }

      parsedLines.push({
        product,
        location_id: locationId,
        location_name: locationName,
        quantity: qty,
        batch_number: product.batch_tracking ? (batchVal || '') : '',
        serial_number: product.serial_tracking ? (serialVal || '') : '',
        expiry_date: product.expiry_tracking ? (expiryVal || '') : '',
      })
    }

    // Validate single location
    if (locationsUsed.size > 1) {
      rowErrors.push('This file contains multiple locations. A stocktake import can only adjust one location at a time. Please split into separate files per location.')
    }

    if (rowErrors.length > 0) {
      setErrors(rowErrors)
      setParsing(false)
      return
    }

    if (parsedLines.length === 0) {
      setErrors(['No valid product rows found in the file.'])
      setParsing(false)
      return
    }

    // Determine the single location (may be null if no location column)
    const resolvedLocationId   = parsedLines[0].location_id
    const resolvedLocationName = parsedLines[0].location_name

    // Build lines in the shape NewAdjustment expects
    function makeKey() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

    const adjustmentLines = parsedLines.map(row => ({
      _key: makeKey(),
      product_id:      row.product.id,
      product_name:    row.product.name,
      product_sku:     row.product.sku ?? '',
      unit:            row.product.sell_uom ?? 'Each',
      quantity_before: 0,   // will be overwritten on mount from stockLevels
      quantity_after:  row.quantity,
      reason:          'Stocktake',
      batch_number:    row.batch_number,
      serial_number:   row.serial_number,
      expiry_date:     row.expiry_date,
      needs_serial:    !!row.product.serial_tracking,
      needs_batch:     !!row.product.batch_tracking,
      needs_expiry:    !!row.product.expiry_tracking,
    }))

    // Store in sessionStorage and navigate
    try {
      sessionStorage.setItem('stocktake_prefill', JSON.stringify({
        location_id:   resolvedLocationId,
        location_name: resolvedLocationName,
        reason:        'Stocktake',
        lines:         adjustmentLines,
      }))
    } catch {
      setErrors(['Could not store import data. Please try again.'])
      setParsing(false)
      return
    }

    onClose()
    router.push('/products/adjustments/new')
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
        <button className="btn btn-primary" onClick={doImport} disabled={!file || parsing}>
          {parsing ? 'Reading…' : 'Review Adjustment'}
        </button>
      </div>

      <style>{`
        .import-drop-zone { border: 2px dashed var(--gray-200); border-radius: 12px; padding: 28px 20px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
        .import-drop-zone:hover, .import-drop-zone.dragging { border-color: var(--teal); background: var(--teal-surface); }
      `}</style>
    </div>
  )
}
