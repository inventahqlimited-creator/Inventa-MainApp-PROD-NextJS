// Support access: a Hub (platform) admin can open any organisation in the app as an administrator.
//
// How it works: each Hub admin gets one hidden "support identity" per organisation — a real login whose membership row
// is an administrator of that organisation. Because it is a real member, every existing permission, security and
// audit rule keeps working unchanged. The membership's name carries the Hub admin's real name and email, so the audit
// log reads e.g. "Jane Doe (Super Admin · jane@inventahq.com)".
// Support identities are hidden from the customer's team list and never use up a paid seat.
import { createHmac, createHash, timingSafeEqual } from 'crypto'

export const SUPPORT_DOMAIN = 'support.inventahq.com'
export const isSupportEmail = (email: string | null | undefined) => (email ?? '').toLowerCase().endsWith(`@${SUPPORT_DOMAIN}`)

/** Stable address (never mailed) that identifies one Hub admin's support identity inside one organisation. */
export function supportEmailFor(adminUserId: string, orgId: string): string {
  const h = createHash('sha256').update(`${adminUserId}:${orgId}`).digest('hex').slice(0, 24)
  return `hs-${h}@${SUPPORT_DOMAIN}`
}

const secret = () => process.env.SUPPORT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const mac = (th: string, orgId: string, exp: number) => createHmac('sha256', secret()).update(`${th}.${orgId}.${exp}`).digest('hex')

export function signSupportLink(th: string, orgId: string, ttlSeconds = 120) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  return { exp, sig: mac(th, orgId, exp) }
}

export function verifySupportLink(th: string, orgId: string, exp: number, sig: string): boolean {
  if (!secret() || !th || !orgId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const a = Buffer.from(mac(th, orgId, exp)); const b = Buffer.from(sig || '')
  return a.length === b.length && timingSafeEqual(a, b)
}

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.inventahq.com').replace(/\/$/, '')
export const hubUrl = () => {
  const host = (process.env.HUB_HOSTS || 'hub.inventahq.com').split(',')[0].trim()
  return `https://${host}`
}
