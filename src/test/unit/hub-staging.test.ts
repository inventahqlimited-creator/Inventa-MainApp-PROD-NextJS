import { describe, it, expect, afterEach } from 'vitest'
import { stagingConfig, stagingEnabled } from '@/lib/hub/staging'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })

describe('Open Staging InventaHQ', () => {
  it('is hidden until the staging key is added', () => {
    delete process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.inventahq.com'
    expect(stagingEnabled()).toBe(false)
  })
  it('shows on production once the key is set', () => {
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY = 'k'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.inventahq.com'
    expect(stagingEnabled()).toBe(true)
  })
  it('never shows on the staging app itself', () => {
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY = 'k'
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.inventahq.com/'
    expect(stagingEnabled()).toBe(false)
  })
  it('signs links with the staging link secret, falling back to the staging service key', () => {
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY = 'svc'
    delete process.env.STAGING_SUPPORT_LINK_SECRET
    expect(stagingConfig().linkKey).toBe('svc')
    process.env.STAGING_SUPPORT_LINK_SECRET = 'link'
    expect(stagingConfig().linkKey).toBe('link')
    expect(stagingConfig().appBase).toBe('https://staging.inventahq.com')
  })
})
