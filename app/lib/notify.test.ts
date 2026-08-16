import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detailText, plural, translator } from './i18n'
import { LOCALES } from './i18n/locale'
import { notifyDelta } from './notify'
import { set } from './store'
import type { Detail, Warning } from './warnings'

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

/**
 * The notification itself, not just the strings in it. A background push has no
 * page to correct a bad call, so the case that matters most is the silent one:
 * unchanged weather must produce nothing at all.
 */
describe('notifyDelta', () => {
  const shown: { title: string; options: NotificationOptions }[] = []

  // `navigator` is a read-only global in Node, so it has to be defined rather
  // than assigned; stubGlobal does that and restores it afterwards.
  const grant = (permission: NotificationPermission) => {
    vi.stubGlobal('Notification', { permission })
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          showNotification: (title: string, options: NotificationOptions) => {
            shown.push({ title, options })
            return Promise.resolve()
          }
        })
      }
    })
  }

  const warning = (seq: number, over: Partial<Warning> = {}): Warning => ({
    seq,
    condition: 'wind',
    forecastHour: Date.UTC(2026, 7, 6, 14),
    detail: { kind: 'gusts', gustKmh: 62 },
    source: 'open-meteo',
    ...over
  })

  beforeEach(async () => {
    shown.length = 0
    await set('locale', 'en')
    grant('granted')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows nothing when nothing changed', async () => {
    // The entire reason the diff exists: unchanged weather is lock-screen spam.
    await notifyDelta({ worsened: [], cleared: [] })
    expect(shown).toEqual([])
  })

  it('shows nothing when permission was never granted', async () => {
    grant('default')
    await notifyDelta({ worsened: [warning(1)], cleared: [] })
    expect(shown).toEqual([])
  })

  it('names the warnings that worsened', async () => {
    await notifyDelta({ worsened: [warning(1)], cleared: [] }, { 1: 4.2 })
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe(translator('en')('notify.worsened'))
    expect(shown[0].options.body).toContain('4.2')
    expect(shown[0].options.body).toContain('62')
  })

  it('caps the body at three and says how many more there are', async () => {
    const worsened = [1, 2, 3, 4, 5].map((seq) => warning(seq))
    await notifyDelta({ worsened, cleared: [] })
    const lines = (shown[0].options.body ?? '').split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[3]).toContain('2')
  })

  it('titles a clearing differently from a worsening', async () => {
    await notifyDelta({ worsened: [], cleared: [warning(2)] })
    expect(shown[0].title).toBe(translator('en')('notify.clearing'))
    expect(shown[0].title).not.toBe(translator('en')('notify.worsened'))
  })

  it('falls back to the waypoint number when it has no distance for it', async () => {
    await notifyDelta({ worsened: [warning(7)], cleared: [] })
    const body = shown[0].options.body ?? ''
    expect(body).toContain('7')
    expect(body).not.toContain('undefined')
  })
})
