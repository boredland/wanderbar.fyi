import { describe, expect, it } from 'vitest'
import WildfirePanel from './wildfire-panel'
import type { Hotspot, Wildfires, WildfireStatus } from '../lib/wildfire'
import type { Locale } from '../lib/i18n/locale'

const NOW = Date.UTC(2026, 7, 15, 12)

const hotspot = (distanceM: number, hoursAgo: number): Hotspot => ({
  lat: 46.5,
  lon: 8.0,
  distanceM,
  acquiredAtMs: NOW - hoursAgo * 3600_000,
  frpMw: 21.1,
  confidence: 'high',
  satellite: 'NOAA-21/VIIRS'
})

const base: Wildfires = {
  status: 'ok',
  hotspots: [hotspot(3200, 4), hotspot(9000, 20)],
  nearestM: 3200,
  latestAtMs: NOW - 4 * 3600_000,
  truncated: false,
  windowHours: 48,
  provider: 'Copernicus EFFIS/GWIS',
  providerUrl: 'https://forest-fire.emergency.copernicus.eu/',
  fetchedAtMs: NOW
}

/**
 * Honox serialises the island's props into a data- attribute, so assertions
 * must read the rendered body only; otherwise text that never reaches the
 * screen still "appears" in the markup as JSON and the assertions pass
 * vacuously. Same reason as in ./avalanche-panel.test.ts.
 */
// The island is a component, not a callable in its own types; calling it
// directly is what renders it to markup without a DOM.
const renderPanel = WildfirePanel as unknown as (props: {
  wildfires: Wildfires | null
  locale: Locale
}) => unknown

const body = (w: Wildfires | null, locale: Locale = 'en'): string => {
  const html = String(renderPanel({ wildfires: w, locale }))
  return html.replace(/ data-serialized-props="[^"]*"/g, '')
}

const QUIET: WildfireStatus[] = ['none', 'error']
const quiet = (status: WildfireStatus) =>
  body({ ...base, status, hotspots: [], nearestM: null, latestAtMs: null })

describe('WildfirePanel', () => {
  it('reports the distance to the nearest detection and when it was seen', () => {
    const h = body(base)
    expect(h).toContain('3.2 km')
    expect(h).toContain('4 h ago')
    expect(h).toContain('2 detections')
    expect(h).toContain('NOAA-21/VIIRS')
  })

  it('says the detection is a past observation, not the fire’s current position', () => {
    expect(body(base)).toContain('not where the fire is now')
  })

  it('always links out to the issuing service', () => {
    const url = 'https://forest-fire.emergency.copernicus.eu/'
    expect(body(base)).toContain(url)
    for (const s of QUIET) expect(quiet(s), s).toContain(url)
  })

  /**
   * The invariant. "No detection" is a statement about satellites, not about
   * the ground, and an unreachable service is not an all-clear either.
   */
  it('never lets a quiet state read as an assurance that nothing is burning', () => {
    expect(quiet('none')).toContain('not a guarantee')
    expect(quiet('error')).toContain('not the same as nothing burning')
    for (const s of QUIET) {
      expect(quiet(s), s).not.toContain('notice-high')
      // No distance can be printed when there is nothing to measure to.
      expect(quiet(s), s).not.toMatch(/\d+(\.\d+)? km from/)
    }
  })

  it('names why a detection may be missing rather than staying quiet', () => {
    expect(quiet('none')).toContain('cloud hides fires')
    expect(quiet('error')).toContain('dropped connection')
  })

  it('raises the surface only when a fire is close enough to change the walk', () => {
    expect(body({ ...base, hotspots: [hotspot(2000, 1)], nearestM: 2000 })).toContain(
      'notice-high'
    )
    expect(body({ ...base, hotspots: [hotspot(15_000, 1)], nearestM: 15_000 })).not.toContain(
      'notice-high'
    )
  })

  it('offers to hide only the states that name no fire', () => {
    // The quiet states repeat unchanged every sync, so a reader may silence
    // them. A panel naming a live fire never gets the control.
    for (const s of QUIET) expect(quiet(s), s).toContain('notice-hide')
    expect(body(base)).not.toContain('notice-hide')
  })

  it('renders no panel content before the first sync', () => {
    // Honox still emits an empty island wrapper, which carries the component's
    // own filename; what matters is that no panel, and above all no reassuring
    // sentence, reaches the page.
    const h = body(null)
    expect(h).not.toContain('<section')
    expect(h).not.toContain('Active fires')
    expect(h).not.toContain('No fires detected')
  })

  /**
   * The service returns features in ingestion order, not by distance, so the
   * ones past the cap are an arbitrary subset and the nearest fire may be
   * among them. A truncated response must never print a distance, because a
   * number here reads as a clearance.
   */
  it('never claims a nearest distance when the response was truncated', () => {
    const many = { ...base, truncated: true }
    const h = body(many)
    expect(h).not.toMatch(/\d+(\.\d+)? km/)
    expect(h).toContain('Many fires burning')
    expect(h).toContain('cannot tell you which is nearest')
  })

  it('treats a truncated response as close, since the unseen fire may be nearer', () => {
    expect(body({ ...base, truncated: true, nearestM: 19_000 })).toContain('notice-high')
  })

  it('says "less than 1 km" rather than rounding a nearby fire to 0.0 km', () => {
    const close = { ...base, hotspots: [hotspot(43, 1)], nearestM: 43 }
    expect(body(close)).toContain('less than 1 km')
    expect(body(close)).not.toContain('0.0 km')
  })

  it('reads under an hour as a phrase, because the pass time is not to the minute', () => {
    const fresh = { ...base, hotspots: [hotspot(3200, 0)], nearestM: 3200 }
    expect(body(fresh)).toContain('within the hour')
  })

  it('says all of it in every language the app ships', () => {
    for (const locale of ['de', 'fr'] as Locale[]) {
      const ok = body(base, locale)
      const none = body({ ...base, status: 'none', hotspots: [], nearestM: null }, locale)
      // Untranslated keys render as the key itself; see translator in ../lib/i18n.
      expect(ok, locale).not.toContain('wildfire.')
      expect(none, locale).not.toContain('wildfire.')
      expect(ok, locale).toContain('3,2 km')
    }
  })
})
