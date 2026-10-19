import { describe, expect, it } from 'vitest'
import { RELEASES, recentReleases } from './release-notes'

describe('release notes', () => {
  it('has unique ids, newest first, and real content', () => {
    expect(new Set(RELEASES.map(r => r.id)).size).toBe(RELEASES.length)
    const dates = RELEASES.map(r => Date.parse(r.date))
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
    for (const r of RELEASES) {
      expect(r.title && r.summary).toBeTruthy()
      expect(r.sections.length).toBeGreaterThan(0)
      for (const s of r.sections) { expect(s.heading).toBeTruthy(); expect(s.items.length).toBeGreaterThan(0) }
    }
  })
  it('only announces recent releases', () => {
    expect(recentReleases(new Date('2026-10-20')).map(r => r.id)).toContain('2026-10-13')
    expect(recentReleases(new Date('2027-03-01'))).toEqual([])
  })
})
