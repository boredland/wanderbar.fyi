import { describe, expect, it } from 'vitest'
import { freshnessOf } from './freshness'
import { ageText, translator } from './i18n'

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
  const en = translator('en')
  const de = translator('de')
  const fr = translator('fr')

  it('never states an age of zero', () => {
    expect(ageText(en, 'en', 0)).toBe('under a minute')
    expect(ageText(en, 'en', 59_000)).toBe('under a minute')
  })

  it('counts in the unit a reader would judge the forecast by', () => {
    expect(ageText(en, 'en', 60_000)).toBe('1 minute')
    expect(ageText(en, 'en', 45 * 60_000)).toBe('45 minutes')
    expect(ageText(en, 'en', 3600_000)).toBe('1 hour')
    expect(ageText(en, 'en', 7 * 3600_000)).toBe('7 hours')
  })

  it('stays in hours across a night, so an overnight gap is not read as a date', () => {
    expect(ageText(en, 'en', 20 * 3600_000)).toBe('20 hours')
    expect(ageText(en, 'en', 36 * 3600_000)).toBe('36 hours')
    expect(ageText(en, 'en', 50 * 3600_000)).toBe('2 days')
  })

  it('inflects in each language rather than bolting an English -s on', () => {
    expect(ageText(de, 'de', 3600_000)).toBe('1 Stunde')
    expect(ageText(de, 'de', 7 * 3600_000)).toBe('7 Stunden')
    expect(ageText(fr, 'fr', 3600_000)).toBe('1 heure')
    expect(ageText(fr, 'fr', 7 * 3600_000)).toBe('7 heures')
  })

  it("follows French's rule that a lone unit is singular", () => {
    // Intl.PluralRules, not a hand-rolled n === 1 check: French says
    // "1 minute" where English and German agree, and the rule differs at 0.
    expect(ageText(fr, 'fr', 60_000)).toBe('1 minute')
    expect(ageText(fr, 'fr', 2 * 60_000)).toBe('2 minutes')
  })
})
