// src/lib/notifications/config.ts
// Notification settings (what the bell alerts about) and the pure rules for "how late is it".

export type OverdueRule = { enabled: boolean; warn_days: number; critical_days: number }
export type NotificationSettings = {
  low_stock: { enabled: boolean }
  sales_overdue: OverdueRule
  purchase_overdue: OverdueRule
}
export type AlertLevel = 'warning' | 'critical'

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  low_stock: { enabled: false },
  sales_overdue: { enabled: false, warn_days: 1, critical_days: 5 },
  purchase_overdue: { enabled: false, warn_days: 1, critical_days: 5 },
}

const int = (v: unknown, d: number, min: number, max: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}

function rule(raw: unknown): OverdueRule {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const warn = int(r.warn_days, 1, 1, 365)
  const crit = int(r.critical_days, 5, 1, 365)
  return { enabled: typeof r.enabled === 'boolean' ? r.enabled : false, warn_days: warn, critical_days: Math.max(crit, warn) }
}

export function normalizeNotifications(raw: unknown): NotificationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ls = (r.low_stock && typeof r.low_stock === 'object' ? r.low_stock : {}) as Record<string, unknown>
  return {
    low_stock: { enabled: typeof ls.enabled === 'boolean' ? ls.enabled : false },
    sales_overdue: rule(r.sales_overdue),
    purchase_overdue: rule(r.purchase_overdue),
  }
}

/** Whole days between two YYYY-MM-DD dates (a minus b), ignoring time zones and daylight saving. */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(a) - t(b)) / 86_400_000)
}

/** null = not late enough to mention. */
export function overdueLevel(expected: string | null, today: string, rule: OverdueRule): { level: AlertLevel; days: number } | null {
  if (!expected || !/^\d{4}-\d{2}-\d{2}/.test(expected)) return null
  const days = daysBetween(today, expected)
  if (days < rule.warn_days) return null
  return { level: days >= rule.critical_days ? 'critical' : 'warning', days }
}
