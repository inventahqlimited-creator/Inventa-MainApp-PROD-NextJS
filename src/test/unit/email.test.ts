// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { pickRecipient, effectiveFrom, parseAddresses, readSettings, validateSettingsInput, isDomain, EMPTY_SETTINGS } from '@/lib/email/config'
import { cleanHtml, fillPlaceholders, wrapEmail } from '@/lib/email/render'
import { cleanTemplate, cleanSignature } from '@/lib/email/library'
import { mapStatus } from '@/lib/email/resend'

describe('email settings', () => {
  it('parses and de-duplicates address lists', () => {
    const r = parseAddresses('a@x.com, A@x.com; b@y.co.nz\nnope')
    expect(r.ok).toEqual(['a@x.com', 'b@y.co.nz'])
    expect(r.bad).toEqual(['nope'])
  })
  it('validates the editable settings', () => {
    expect(validateSettingsInput({ from_name: 'Acme "Ltd"', from_local: 'Accounts', reply_to: 'x@acme.nz', default_cc: 'a@b.co' })).toEqual({ value: { from_name: 'Acme Ltd', from_local: 'accounts', reply_to: 'x@acme.nz', default_cc: ['a@b.co'], default_recipient: 'billing' } })
    expect('error' in validateSettingsInput({ from_local: 'bad local' })).toBe(true)
    expect('error' in validateSettingsInput({ reply_to: 'nope' })).toBe(true)
    expect('error' in validateSettingsInput({ default_cc: 'a@b.co, x' })).toBe(true)
  })
  it('uses the own domain only once verified, else the shared sender', () => {
    const s = { ...EMPTY_SETTINGS, from_name: 'Acme', domain: 'acme.nz', domain_status: 'pending' as const }
    expect(effectiveFrom(s, 'Acme Ltd', 'no-reply@mail.inventahq.com')?.address).toBe('no-reply@mail.inventahq.com')
    expect(effectiveFrom({ ...s, domain_status: 'verified' }, 'Acme Ltd', '')?.header).toBe('"Acme" <accounts@acme.nz>')
    expect(effectiveFrom(s, 'Acme Ltd', '')).toBeNull()
  })
  it('reads junk settings safely and checks domains', () => {
    expect(readSettings('x').domain_status).toBe('none')
    expect(isDomain('acme.co.nz')).toBe(true)
    expect(isDomain('https://acme.nz')).toBe(false)
    expect(mapStatus('temporary_failure')).toBe('failed')
  })
})

describe('default recipient', () => {
  const c = { email: 'main@x.com', bill_email: 'bill@x.com', ship_email: 'ship@x.com' }
  it('starts with the chosen address and falls back to the others', () => {
    expect(pickRecipient(c, 'billing')).toBe('bill@x.com')
    expect(pickRecipient(c, 'shipping')).toBe('ship@x.com')
    expect(pickRecipient({ email: 'main@x.com', bill_email: '', ship_email: null }, 'shipping')).toBe('main@x.com')
    expect(pickRecipient({ email: 'main@x.com', bill_email: 'bill@x.com', ship_email: null }, 'shipping')).toBe('bill@x.com')
    expect(pickRecipient(null, 'billing')).toBe('')
  })
  it('keeps the setting when saved', () => {
    expect(validateSettingsInput({ default_recipient: 'shipping' })).toMatchObject({ value: { default_recipient: 'shipping' } })
    expect(validateSettingsInput({ default_recipient: 'main' })).toMatchObject({ value: { default_recipient: 'billing' } })
  })
})

describe('email body', () => {
  it('fills placeholders and escapes values', () => {
    expect(fillPlaceholders('Hi {{customer_name}} {{ doc_number }} {{unknown}}', { customer_name: '<b>Al</b>', doc_number: 'INV-1' }, true)).toBe('Hi &lt;b&gt;Al&lt;/b&gt; INV-1 ')
  })
  it('strips scripts, event handlers and bad links', () => {
    const out = cleanHtml('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://ok.com">ok</a></p>')
    expect(out).not.toMatch(/script|onclick|javascript:/)
    expect(out).toContain('https://ok.com')
    expect(wrapEmail('<p>Body</p>', '<p>Sig</p>')).toContain('Sig')
  })
  it('validates signatures and templates', () => {
    expect('error' in cleanSignature({ name: ' ' })).toBe(true)
    expect('error' in cleanTemplate({ name: 'T', module: 'bogus' })).toBe(true)
    const t = cleanTemplate({ name: 'T', module: 'sales', subject: 'a\nb', body_html: '<script>x</script><p>y</p>' })
    expect('value' in t && t.value.subject).toBe('a b')
    expect('value' in t && t.value.body_html).toBe('<p>y</p>')
  })
})
