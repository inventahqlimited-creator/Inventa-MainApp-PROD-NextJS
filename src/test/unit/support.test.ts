import { describe, it, expect, beforeAll } from 'vitest'
import { supportEmailFor, isSupportEmail, signSupportLink, verifySupportLink, SUPPORT_DOMAIN } from '@/lib/hub/support'

beforeAll(() => { process.env.SUPPORT_LINK_SECRET = 'test-secret' })

describe('support access', () => {
  it('derives a stable, per-admin per-org address on the support domain', () => {
    const a = supportEmailFor('admin-1', 'org-1')
    expect(a).toBe(supportEmailFor('admin-1', 'org-1'))
    expect(a).not.toBe(supportEmailFor('admin-2', 'org-1'))
    expect(a).not.toBe(supportEmailFor('admin-1', 'org-2'))
    expect(a.endsWith(`@${SUPPORT_DOMAIN}`)).toBe(true)
    expect(a.split('@')[0].length).toBeLessThan(64)
  })
  it('recognises support addresses only', () => {
    expect(isSupportEmail(`hs-abc@${SUPPORT_DOMAIN}`)).toBe(true)
    expect(isSupportEmail('HS-ABC@SUPPORT.INVENTAHQ.COM')).toBe(true)
    expect(isSupportEmail('bob@inventahq.com')).toBe(false)
    expect(isSupportEmail('x@evilsupport.inventahq.com.au')).toBe(false)
    expect(isSupportEmail(null)).toBe(false)
  })
  it('accepts a fresh signed link and rejects tampering or expiry', () => {
    const { exp, sig } = signSupportLink('tok', 'org-1')
    expect(verifySupportLink('tok', 'org-1', exp, sig)).toBe(true)
    expect(verifySupportLink('tok2', 'org-1', exp, sig)).toBe(false)
    expect(verifySupportLink('tok', 'org-2', exp, sig)).toBe(false)
    expect(verifySupportLink('tok', 'org-1', exp + 1, sig)).toBe(false)
    const old = signSupportLink('tok', 'org-1', -5)
    expect(verifySupportLink('tok', 'org-1', old.exp, old.sig)).toBe(false)
  })
})
