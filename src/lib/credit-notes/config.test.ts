import { describe, expect, it } from 'vitest'
import { creditLineTotal, DEFAULT_CREDIT_NOTE_SETTINGS, formatCreditNoteNumber, normalizeCreditNoteSettings } from './config'

describe('credit note settings', () => {
  it('defaults: enabled, CN- prefix, 4 digits, authorised in Xero', () => {
    const s = normalizeCreditNoteSettings(null)
    expect(s.enabled).toBe(true)
    expect(s.prefix).toBe('CN-')
    expect(s.digits).toBe(4)
    expect(s.xero_status).toBe('AUTHORISED')
  })
  it('keeps what was saved and repairs what is malformed', () => {
    const s = normalizeCreditNoteSettings({ enabled: false, prefix: 'CR-', suffix: '-NZ', start: '50', digits: 99, xero_status: 'DRAFT' })
    expect(s).toMatchObject({ enabled: false, prefix: 'CR-', suffix: '-NZ', start: 50, digits: 10, xero_status: 'DRAFT' })
  })
  it('numbers from the start number, then after the highest existing number', () => {
    expect(formatCreditNoteNumber(DEFAULT_CREDIT_NOTE_SETTINGS, [])).toBe('CN-0001')
    expect(formatCreditNoteNumber(DEFAULT_CREDIT_NOTE_SETTINGS, ['CN-0001', 'CN-0007', 'CN-0003'])).toBe('CN-0008')
    expect(formatCreditNoteNumber({ ...DEFAULT_CREDIT_NOTE_SETTINGS, prefix: 'CR-', suffix: '-NZ', start: 100 }, [])).toBe('CR-0100-NZ')
    expect(formatCreditNoteNumber({ ...DEFAULT_CREDIT_NOTE_SETTINGS, prefix: 'CR-', suffix: '-NZ' }, ['CR-0009-NZ'])).toBe('CR-0010-NZ')
  })
  it('line total is qty × price less discount plus tax', () => {
    expect(creditLineTotal({ quantity: 2, unit_price: 34.9, discount: 10, tax_rate: 15 })).toBe(72.24)
    expect(creditLineTotal({ quantity: 1, unit_price: 189, discount: 0, tax_rate: 15 })).toBe(217.35)
  })
})
