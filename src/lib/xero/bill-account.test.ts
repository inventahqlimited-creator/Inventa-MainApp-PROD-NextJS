import { describe, it, expect } from 'vitest'
import { billLineAccount } from './bill'

const settings = { inventory_account_code: '630', purchases_account_code: '310' }

describe('billLineAccount', () => {
  it('sends a tracked stock line to the inventory asset account', () => {
    expect(billLineAccount(true, settings)).toBe('630')
  })
  it('sends other lines to the purchases account', () => {
    expect(billLineAccount(false, settings)).toBe('310')
  })
  it('leaves the account to Xero when no inventory account is set', () => {
    expect(billLineAccount(true, { inventory_account_code: null, purchases_account_code: '310' })).toBeNull()
  })
})
