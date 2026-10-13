import { describe, it, expect } from 'vitest'
import { saveError } from '@/lib/api/db-error'

describe('saveError', () => {
  it('explains a duplicate SKU', () => {
    const e = saveError({ code: '23505', message: 'duplicate key value violates unique constraint "products_org_id_sku_key"', details: 'Key (org_id, sku)=(1b2c, ABC-1) already exists.' }, 'product')
    expect(e.status).toBe(409)
    expect(e.message).toContain('product number (SKU)')
    expect(e.message).toContain('ABC-1')
  })
  it('handles a duplicate with no parsable detail', () => {
    expect(saveError({ code: '23505', message: 'duplicate key' }, 'contact').message).toMatch(/already exists/)
  })
  it('falls back to a friendly retry message', () => {
    const e = saveError({ code: 'XX000', message: 'boom' }, 'location')
    expect(e.status).toBe(500)
    expect(e.message).toMatch(/try again/)
  })
})
