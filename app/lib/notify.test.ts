import { describe, expect, it } from 'vitest'
import { detailText, plural, translator } from './i18n'
import { LOCALES } from './i18n/locale'
import type { Detail } from './warnings'

/**
 * Notification text is built in the service worker from a background push,
 * where there is no page to ask and no chance to correct a bad string. These
 * check the pieces that assemble it: that every warning shape renders in every
 * language, and that counts inflect rather than getting an English -s.
 */
const EVERY_DETAIL: Detail[] = [
  { kind: 'rainRate', mmPerH: 2.5 },
  { kind: 'hailPossible' },
  { kind: 'gusts', gustKmh: 62 },
  { kind: 'snowfall', cm: 3.4 },
  { kind: 'snowExpected' },
  { kind: 'blizzard', gustKmh: 55, tempC: -4 },
  { kind: 'instability', band: 'violent' },
  { kind: 'icePrecip', code: 66 },
  { kind: 'windChill', feelsC: -31, frostbite: '5to10' },
  { kind: 'windChill', feelsC: -16, frostbite: null },
  { kind: 'lyingSnow', cm: 85 },
  { kind: 'heat', tempC: 31.5 },
  { kind: 'fire', danger: 'very high', fwi: 38 },
  { kind: 'sunrise', atMs: Date.parse('2026-08-06T05:12:00Z') },
  { kind: 'beforeSunrise', atMs: Date.parse('2026-08-06T05:12:00Z') },
  { kind: 'afterSunset', atMs: Date.parse('2026-08-06T20:40:00Z') },
  { kind: 'dusk', atMs: Date.parse('2026-08-06T20:40:00Z') }
]

describe('warning detail text', () => {
  it('renders every warning shape in every language', () => {
    for (const locale of LOCALES) {
      const t = translator(locale)
      for (const d of EVERY_DETAIL) {
        const text = detailText(t, locale, d)
        expect(text, `${locale}/${d.kind}`).toBeTruthy()
        // An unresolved placeholder means a catalogue and a caller disagree.
        expect(text, `${locale}/${d.kind} has an unfilled placeholder`).not.toMatch(/\{\w+\}/)
        // A bare message key means the lookup missed.
        expect(text, `${locale}/${d.kind} leaked a key`).not.toMatch(/^(detail|ice|instability)\./)
      }
    }
  })

  it('formats numbers the way each language writes them', () => {
    // The whole reason Detail carries values instead of a baked sentence.
    const rain: Detail = { kind: 'rainRate', mmPerH: 2.5 }
    expect(detailText(translator('en'), 'en', rain)).toContain('2.5')
    expect(detailText(translator('de'), 'de', rain)).toContain('2,5')
    expect(detailText(translator('fr'), 'fr', rain)).toContain('2,5')
  })

  it('never prints a stored English phrase after a language switch', () => {
    // A forecast fetched in English and read in German must be German: this is
    // what breaks if detail ever goes back to being a pre-rendered string.
    const gusts: Detail = { kind: 'gusts', gustKmh: 62 }
    expect(detailText(translator('de'), 'de', gusts)).toBe('Böen 62 km/h')
    expect(detailText(translator('fr'), 'fr', gusts)).toBe('rafales 62 km/h')
  })
})

describe('lifted-warning counts', () => {
  it('inflects per language instead of appending an English -s', () => {
    expect(plural(translator('en'), 'en', 'notify.lifted', 1)).toContain('1 warning')
    expect(plural(translator('en'), 'en', 'notify.lifted', 3)).toContain('3 warnings')
    expect(plural(translator('de'), 'de', 'notify.lifted', 1)).toContain('1 Warnung')
    expect(plural(translator('de'), 'de', 'notify.lifted', 3)).toContain('3 Warnungen')
    expect(plural(translator('fr'), 'fr', 'notify.lifted', 1)).toContain('1 alerte levée')
    expect(plural(translator('fr'), 'fr', 'notify.lifted', 3)).toContain('3 alertes levées')
  })
})
