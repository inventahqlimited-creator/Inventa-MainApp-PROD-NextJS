// src/lib/auth/password-policy.ts
// One place that defines the organisation password policy: its shape, defaults,
// how a stored value is cleaned, and how a password / a password age is checked.
// Used by the settings screen, the set-password API and the app layout (expiry).

export const ROTATION_DAYS = [14, 30, 90, 180] as const
export const MIN_LENGTH_FLOOR = 8   // never allow a policy weaker than this
export const MIN_LENGTH_CAP = 64

export type PasswordPolicy = {
  rotation: { enabled: boolean; days: number; enabled_at: string | null }
  strength: { enabled: boolean; min_length: number; upper: boolean; lower: boolean; number: boolean; special: boolean }
}

export const DEFAULT_POLICY: PasswordPolicy = {
  rotation: { enabled: false, days: 90, enabled_at: null },
  strength: { enabled: false, min_length: 8, upper: true, lower: true, number: true, special: false },
}

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

/** Turns whatever is stored (or sent) into a valid policy. Anything unknown falls back to the default. */
export function normalizePolicy(raw: unknown): PasswordPolicy {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>
  const rot = r.rotation ?? {}
  const str = r.strength ?? {}
  const days = Number(rot.days)
  const len = Math.floor(Number(str.min_length))
  const at = typeof rot.enabled_at === 'string' && !Number.isNaN(Date.parse(rot.enabled_at)) ? rot.enabled_at : null
  return {
    rotation: {
      enabled: bool(rot.enabled, false),
      days: (ROTATION_DAYS as readonly number[]).includes(days) ? days : DEFAULT_POLICY.rotation.days,
      enabled_at: at,
    },
    strength: {
      enabled: bool(str.enabled, false),
      min_length: Number.isFinite(len) ? Math.min(MIN_LENGTH_CAP, Math.max(MIN_LENGTH_FLOOR, len)) : DEFAULT_POLICY.strength.min_length,
      upper: bool(str.upper, DEFAULT_POLICY.strength.upper),
      lower: bool(str.lower, DEFAULT_POLICY.strength.lower),
      number: bool(str.number, DEFAULT_POLICY.strength.number),
      special: bool(str.special, DEFAULT_POLICY.strength.special),
    },
  }
}

/** Returns the list of unmet requirements (empty = password is fine). */
export function checkPassword(password: string, policy: PasswordPolicy): string[] {
  const problems: string[] = []
  const min = policy.strength.enabled ? policy.strength.min_length : MIN_LENGTH_FLOOR
  if (password.length < min) problems.push(`at least ${min} characters`)
  if (policy.strength.enabled) {
    if (policy.strength.upper && !/[A-Z]/.test(password)) problems.push('an uppercase letter')
    if (policy.strength.lower && !/[a-z]/.test(password)) problems.push('a lowercase letter')
    if (policy.strength.number && !/[0-9]/.test(password)) problems.push('a number')
    if (policy.strength.special && !/[^A-Za-z0-9]/.test(password)) problems.push('a special character')
  }
  return problems
}

/** Human-readable list of what a password must contain, for hints on the set-password screen. */
export function requirementsText(policy: PasswordPolicy): string {
  const parts = [`at least ${policy.strength.enabled ? policy.strength.min_length : MIN_LENGTH_FLOOR} characters`]
  if (policy.strength.enabled) {
    if (policy.strength.upper) parts.push('an uppercase letter')
    if (policy.strength.lower) parts.push('a lowercase letter')
    if (policy.strength.number) parts.push('a number')
    if (policy.strength.special) parts.push('a special character')
  }
  return parts.join(', ')
}

/**
 * True when the password is older than the rotation period.
 * People with no recorded change date are counted from the day rotation was switched on,
 * so turning it on never locks everyone out at once.
 */
export function isPasswordExpired(policy: PasswordPolicy, changedAt: string | null | undefined, now = Date.now()): boolean {
  if (!policy.rotation.enabled) return false
  const base = changedAt ?? policy.rotation.enabled_at
  const t = base ? Date.parse(base) : NaN
  if (Number.isNaN(t)) return false
  // A change made before rotation was switched on still counts from the switch-on day.
  const start = policy.rotation.enabled_at ? Math.max(t, Date.parse(policy.rotation.enabled_at)) : t
  return now - start > policy.rotation.days * 86_400_000
}
