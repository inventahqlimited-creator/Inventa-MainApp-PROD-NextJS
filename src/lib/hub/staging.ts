// The Hub can open an organisation in the staging app as well as production.
// Needs, on the PRODUCTION app (Fly secrets):
//   STAGING_SUPABASE_SERVICE_ROLE_KEY  — the staging Supabase project's service-role key
//   STAGING_SUPPORT_LINK_SECRET        — only if the staging app has SUPPORT_LINK_SECRET set (must be the same value)
// Optional: STAGING_SUPABASE_URL, STAGING_APP_URL (defaults below). Server-only.
const DEFAULT_URL = 'https://bhftrrftncxmtadxisgv.supabase.co'
const DEFAULT_APP = 'https://staging.inventahq.com'

export function stagingConfig() {
  const url = process.env.STAGING_SUPABASE_URL || DEFAULT_URL
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || ''
  const appBase = (process.env.STAGING_APP_URL || DEFAULT_APP).replace(/\/$/, '')
  // the staging app verifies links with its own SUPPORT_LINK_SECRET, or its service-role key when that isn't set
  const linkKey = process.env.STAGING_SUPPORT_LINK_SECRET || key
  return { url, key, appBase, linkKey }
}

/** Shown only on the production Hub, and only once the staging key has been added. */
export function stagingEnabled(): boolean {
  const { key, appBase } = stagingConfig()
  const self = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  return !!key && self !== appBase
}

export function createStagingAdminClient() {
  const { url, key } = stagingConfig()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
