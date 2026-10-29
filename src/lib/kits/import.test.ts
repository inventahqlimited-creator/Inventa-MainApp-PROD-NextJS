import { describe, expect, it } from 'vitest'
import { parseCsv, planKitImport, readImportRows, templateCsv, type ImportProduct } from './import'

const P = (id: string, sku: string, o: Partial<ImportProduct> = {}): ImportProduct => ({ id, name: `Item ${sku}`, sku, type: 'Stock', is_kit: false, is_active: true, unit: 'Each', hasStock: false, ...o })
const products = [
  P('k1', 'KIT1', { type: 'NonStock' }), P('k2', 'KIT2', { type: 'Stock' }), P('k3', 'KIT3', { type: 'NonStock', hasStock: true }),
  P('a', 'A'), P('b', 'B', { unit: 'Box' }), P('old', 'OLDKIT', { type: 'NonStock', is_kit: true }), P('off', 'OFF', { is_active: false }),
]
const run = (csv: string) => { const r = readImportRows(csv); if (!r.ok) throw new Error(r.error); return planKitImport(r.rows, products) }

describe('parseCsv', () => {
  it('handles quotes, commas in quotes, BOM and CRLF', () => {
    expect(parseCsv('﻿a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']])
  })
  it('ignores blank lines', () => { expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]) })
})

describe('readImportRows', () => {
  it('reads the template', () => { const r = readImportRows(templateCsv()); expect(r.ok && r.rows.length).toBe(5) })
  it('accepts reordered / differently written headers', () => {
    const r = readImportRows('qty,component sku,KIT SKU\n2,A,KIT1')
    expect(r.ok && r.rows[0]).toMatchObject({ kitSku: 'KIT1', compSku: 'A', qty: '2' })
  })
  it('explains missing columns and empty files', () => {
    expect(readImportRows('a,b\n1,2').ok).toBe(false)
    expect(readImportRows('').ok).toBe(false)
  })
})

describe('planKitImport', () => {
  it('imports a good kit and sets the flag', () => {
    const { results, kits } = run('Kit SKU,Component SKU,Quantity,Unit\nKIT1,A,2,Each\nKIT1,B,1,Box')
    expect(results.every(r => r.status === 'ok')).toBe(true)
    expect(kits).toEqual([{ kitId: 'k1', sku: 'KIT1', name: 'Item KIT1', wasKit: false, lines: [{ component_id: 'a', quantity: 2 }, { component_id: 'b', quantity: 1 }] }])
  })
  it('matches SKUs without caring about capitals', () => { expect(run('Kit SKU,Component SKU,Quantity\nkit1,a,1').kits).toHaveLength(1) })
  it('replaces an existing kit', () => { const { kits, results } = run('Kit SKU,Component SKU,Quantity\nOLDKIT,A,1'); expect(kits[0].wasKit).toBe(true); expect(results[0].message).toMatch(/replaces/) })
  it('rejects a kit that is not Non Stock, with the reason', () => {
    const { results, kits } = run('Kit SKU,Component SKU,Quantity\nKIT2,A,1')
    expect(kits).toHaveLength(0); expect(results[0].message).toMatch(/Non Stock first/)
  })
  it('rejects a kit that holds stock', () => { expect(run('Kit SKU,Component SKU,Quantity\nKIT3,A,1').results[0].message).toMatch(/stock on hand/) })
  it('skips the whole kit when one row is bad, and says which row', () => {
    const { results, kits } = run('Kit SKU,Component SKU,Quantity\nKIT1,A,1\nKIT1,NOPE,1')
    expect(kits).toHaveLength(0)
    expect(results.map(r => r.status)).toEqual(['skipped', 'error'])
    expect(results[1].message).toMatch(/NOPE/)
  })
  it('checks quantity, unit, duplicates, inactive items and kits in kits', () => {
    const msg = (csv: string) => run(csv).results.map(r => r.message).join(' | ')
    expect(msg('Kit SKU,Component SKU,Quantity\nKIT1,A,0')).toMatch(/greater than zero/)
    expect(msg('Kit SKU,Component SKU,Quantity\nKIT1,A,abc')).toMatch(/isn’t valid/)
    expect(msg('Kit SKU,Component SKU,Quantity,Unit\nKIT1,B,1,Each')).toMatch(/doesn’t match/)
    expect(msg('Kit SKU,Component SKU,Quantity\nKIT1,A,1\nKIT1,A,2')).toMatch(/listed twice/)
    expect(msg('Kit SKU,Component SKU,Quantity\nKIT1,OFF,1')).toMatch(/inactive/)
    expect(msg('Kit SKU,Component SKU,Quantity\nKIT1,OLDKIT,1')).toMatch(/kits can’t contain other kits/)
    expect(msg('Kit SKU,Component SKU,Quantity\nKIT1,KIT1,1')).toMatch(/contain itself|other kits/)
  })
  it('reports an unknown kit SKU', () => { expect(run('Kit SKU,Component SKU,Quantity\nZZZ,A,1').results[0].message).toMatch(/Create the kit/) })
  it('handles several kits in one file independently', () => {
    const { kits, results } = run('Kit SKU,Component SKU,Quantity\nKIT1,A,1\nKIT2,A,1')
    expect(kits.map(k => k.kitId)).toEqual(['k1']); expect(results.map(r => r.status)).toEqual(['ok', 'error'])
  })
})
