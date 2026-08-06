import { describe, expect, it } from 'vitest'
import { ageText, freshnessOf } from './freshness'

const NOW = Date.parse('2026-08-06T12:00:00.000Z')
const agoH = (h: number) => NOW - h * 3600_000

describe('freshnessOf', () => {
  it('treats a missing forecast as expired, never as fresh', () => {
    expect(freshnessOf(null, NOW)).toBe('expired')
  })

  it('grades age across the whole scale', () => {
    expect(freshnessOf(agoH(0.5), NOW)).toBe('fresh')
    expect(freshnessOf(agoH(3), NOW)).toBe('aging')
    expect(freshnessOf(agoH(8), NOW)).toBe('stale')
    expect(freshnessOf(agoH(30), NOW)).toBe('expired')
  })

  it('steps down at each boundary rather than at some point past it', () => {
    expect(freshnessOf(agoH(2) + 1, NOW)).toBe('fresh')
    expect(freshnessOf(agoH(2), NOW)).toBe('aging')
    expect(freshnessOf(agoH(6) + 1, NOW)).toBe('aging')
    expect(freshnessOf(agoH(6), NOW)).toBe('stale')
    expect(freshnessOf(agoH(12) + 1, NOW)).toBe('stale')
    expect(freshnessOf(agoH(12), NOW)).toBe('expired')
  })

  it('does not read a clock skewed into the future as old', () => {
    expect(freshnessOf(NOW + 3600_000, NOW)).toBe('fresh')
  })
})

describe('ageText', () => {
  it('never states an age of zero', () => {
    expect(ageText(0)).toBe('under a minute')
    expect(ageText(59_000)).toBe('under a minute')
  })

  it('counts in the unit a reader would judge the forecast by', () => {
    expect(ageText(60_000)).toBe('1 minute')
    expect(ageText(45 * 60_000)).toBe('45 minutes')
    expect(ageText(3600_000)).toBe('1 hour')
    expect(ageText(7 * 3600_000)).toBe('7 hours')
  })

  it('stays in hours across a night, so an overnight gap is not read as a date', () => {
    expect(ageText(20 * 3600_000)).toBe('20 hours')
    expect(ageText(36 * 3600_000)).toBe('36 hours')
    expect(ageText(50 * 3600_000)).toBe('2 days')
  })
})
