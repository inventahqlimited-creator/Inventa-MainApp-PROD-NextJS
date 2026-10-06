// src/lib/auth/security-settings.ts
// Organisation security settings: audit log on/off, session timeout, IP allow-list.
// Pure helpers (normalize / IP matching) plus a small cached loader used on every request.
export const SESSION_TIMEOUT_OPTIONS = [30, 60, 240, 480, 720] as const // minutes
export const MAX_IP_RULES = 50

export type IpRule = { value: string; label: string; added_at: string }
export type SecuritySettings = {
  audit_log_enabled: boolean
  session_timeout_minutes: number
  ip_rules: IpRule[]
}

export const DEFAULT_SECURITY: SecuritySettings = {
  audit_log_enabled: true,
  session_timeout_minutes: 720, // 12 hours — the longest option, so existing people aren't surprised
  ip_rules: [],
}

export function sessionTimeoutLabel(min: number) {
  return min < 60 ? `${min} minutes` : min === 60 ? '1 hour' : `${min / 60} hours`
}

// ── IP addresses ──────────────────────────────────────────────────────

/** 4 for IPv4, 6 for IPv6, 0 for anything else. (No node:net so this also runs in the browser.) */
function isIP(v: string): 0 | 4 | 6 {
  if (v4ToInt(v) !== null) return 4
  if (v.includes(':') && /^[0-9a-f:.]+$/i.test(v)) {
    try { new URL(`http://[${v}]/`); return 6 } catch { return 0 }
  }
  return 0
}

function v4ToInt(ip: string): number | null {
  const p = ip.split('.')
  if (p.length !== 4) return null
  let n = 0
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return null
    n = n * 256 + Number(x)
  }
  return n
}

/** Cleans an address or range the person typed. Returns null if it isn't a valid IPv4 / IPv6 address or IPv4 range (a.b.c.d/nn). */
export function parseIpRule(input: string): string | null {
  const v = (input ?? '').trim().toLowerCase()
  if (!v || v.length > 64) return null
  const slash = v.indexOf('/')
  if (slash === -1) return isIP(v) ? v : null
  const addr = v.slice(0, slash), bits = v.slice(slash + 1)
  if (isIP(addr) !== 4 || !/^\d{1,2}$/.test(bits)) return null
  const n = Number(bits)
  if (n < 8 || n > 32) return null // /0–/7 would allow a huge part of the internet
  return `${addr}/${n}`
}

export function ipMatchesRule(ip: string, rule: string): boolean {
  const addr = ip.trim().toLowerCase().replace(/^::ffff:/, '')
  if (!rule.includes('/')) return addr === rule.replace(/^::ffff:/, '')
  const [base, bitsStr] = rule.split('/')
  const a = v4ToInt(addr), b = v4ToInt(base), bits = Number(bitsStr)
  if (a === null || b === null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((a & mask) >>> 0) === ((b & mask) >>> 0)
}

/** No rules = no restriction. With rules, the address must match one. */
export function isIpAllowed(settings: Pick<SecuritySettings, 'ip_rules'>, ip: string): boolean {
  if (!settings.ip_rules.length) return true
  if (!ip || ip === 'unknown') return false
  return settings.ip_rules.some(r => ipMatchesRule(ip, r.value))
}

// ── Stored value ──────────────────────────────────────────────────────

export function normalizeSecurity(raw: unknown): SecuritySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mins = Number(r.session_timeout_minutes)
  const rules: IpRule[] = []
  if (Array.isArray(r.ip_rules)) {
    for (const x of r.ip_rules.slice(0, MAX_IP_RULES)) {
      const o = (x ?? {}) as Record<string, unknown>
      const value = typeof o.value === 'string' ? parseIpRule(o.value) : null
      if (!value || rules.some(q => q.value === value)) continue
      rules.push({
        value,
        label: typeof o.label === 'string' ? o.label.trim().slice(0, 60) : '',
        added_at: typeof o.added_at === 'string' && !Number.isNaN(Date.parse(o.added_at)) ? o.added_at : new Date().toISOString(),
      })
    }
  }
  return {
    audit_log_enabled: typeof r.audit_log_enabled === 'boolean' ? r.audit_log_enabled : true,
    session_timeout_minutes: (SESSION_TIMEOUT_OPTIONS as readonly number[]).includes(mins) ? mins : DEFAULT_SECURITY.session_timeout_minutes,
    ip_rules: rules,
  }
}

// ── Loader with a short cache (this runs on every request) ────────────

type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const cache = new Map<string, { at: number; value: SecuritySettings }>()
const TTL_MS = 20_000

export async function loadSecurity(db: Db, orgId: string): Promise<SecuritySettings> {
  const hit = cache.get(orgId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const { data } = await db.from('organisations').select('security_settings').eq('id', orgId).single()
  const value = normalizeSecurity((data as { security_settings?: unknown } | null)?.security_settings)
  cache.set(orgId, { at: Date.now(), value })
  return value
}
export function forgetSecurity(orgId: string) { cache.delete(orgId) }
