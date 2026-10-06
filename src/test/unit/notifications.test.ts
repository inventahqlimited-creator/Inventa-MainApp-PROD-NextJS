import { describe, it, expect } from 'vitest'
import { normalizeNotifications, overdueLevel, daysBetween, DEFAULT_NOTIFICATIONS } from '@/lib/notifications/config'

const rule = { enabled: true, warn_days: 1, critical_days: 5 }
describe('notifications', () => {
  it('defaults are all off, bad input is cleaned', () => {
    expect(normalizeNotifications(null)).toEqual(DEFAULT_NOTIFICATIONS)
    const n = normalizeNotifications({ sales_overdue: { enabled: true, warn_days: 7, critical_days: 3 } })
    expect(n.sales_overdue).toEqual({ enabled: true, warn_days: 7, critical_days: 7 })
  })
  it('counts whole days', () => {
    expect(daysBetween('2026-10-06', '2026-10-05')).toBe(1)
    expect(daysBetween('2026-10-01', '2026-09-26')).toBe(5)
    expect(daysBetween('2026-04-06', '2026-04-05')).toBe(1) // across a clock change
  })
  it('levels: none → warning at 1 day → critical at 5', () => {
    expect(overdueLevel('2026-10-06', '2026-10-06', rule)).toBeNull()
    expect(overdueLevel('2026-10-07', '2026-10-06', rule)).toBeNull()
    expect(overdueLevel('2026-10-05', '2026-10-06', rule)).toEqual({ level: 'warning', days: 1 })
    expect(overdueLevel('2026-10-02', '2026-10-06', rule)).toEqual({ level: 'warning', days: 4 })
    expect(overdueLevel('2026-10-01', '2026-10-06', rule)).toEqual({ level: 'critical', days: 5 })
    expect(overdueLevel(null, '2026-10-06', rule)).toBeNull()
  })
})
