import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Waypoint } from './track'
import {
  fetchWildfires,
  nearestDistanceM,
  paddedBbox,
  readHotspots,
  requestUrl
} from './wildfire'

const wp = (lat: number, lon: number, seq = 0): Waypoint => ({
  seq,
  lat,
  lon,
  eleM: 500,
  cumDistM: 0,
  cumAscentM: 0,
  etaOffsetS: 0
})

/** A GWIS feature, in the shape the service actually serves it. */
const feature = (lat: number, lon: number, props: Record<string, unknown> = {}) => ({
  geometry: { coordinates: [lon, lat] as [number, number] },
  properties: {
    acq_at: '2026-08-14 00:03:00',
    frp: '50.8000000000000000',
    confidence: 'High',
    satellite: 'S-NPP/VIIRS',
    ...props
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestUrl', () => {
  it('bounds the query in space and time, because unbounded means every fire since 2012', () => {
    const url = new URL(requestUrl([37, 21, 39, 24], Date.UTC(2026, 7, 13)))
    const filter = url.searchParams.get('filter') ?? ''
    expect(filter).toContain('<gml:lowerCorner>37 21</gml:lowerCorner>')
    expect(filter).toContain('<gml:upperCorner>39 24</gml:upperCorner>')
    expect(filter).toContain('<fes:Literal>2026-08-13 00:00:00</fes:Literal>')
    // Every sensor GWIS ingests, not one satellite's passes.
    expect(url.searchParams.get('typeNames')).toBe('ms:all.hs.query')
  })
})

describe('paddedBbox', () => {
  it('grows the route box enough to contain the whole search radius', () => {
    const [minLat, minLon, maxLat, maxLon] = paddedBbox([wp(46.5, 8.0), wp(46.6, 8.2)])
    // 20 km is a little under 0.18 degrees of latitude.
    expect(46.5 - minLat).toBeGreaterThan(0.17)
    expect(maxLat - 46.6).toBeGreaterThan(0.17)
    // Longitude degrees are shorter at 46 N, so the pad must be wider there.
    expect(8.0 - minLon).toBeGreaterThan(maxLat - 46.6)
    expect(maxLon).toBeGreaterThan(8.2)
  })

  it('stays inside valid coordinates near the poles', () => {
    const [minLat, minLon, maxLat, maxLon] = paddedBbox([wp(89.9, 179.9)])
    expect(minLat).toBeGreaterThanOrEqual(-90)
    expect(maxLat).toBeLessThanOrEqual(90)
    expect(minLon).toBeGreaterThanOrEqual(-180)
    expect(maxLon).toBeLessThanOrEqual(180)
  })
})

describe('nearestDistanceM', () => {
  it('measures to the closest point of the route, not the first', () => {
    const route = [wp(46.0, 8.0, 0), wp(46.5, 8.0, 1), wp(47.0, 8.0, 2)]
    // Beside the middle waypoint, far from either end.
    expect(nearestDistanceM(route, 46.5, 8.0)).toBeLessThan(1)
  })
})

describe('readHotspots', () => {
  const route = [wp(46.5, 8.0)]

  it('keeps detections inside the radius and drops the rest', () => {
    const near = feature(46.52, 8.0)
    const far = feature(48.0, 8.0)
    const got = readHotspots([near, far], route)
    expect(got).toHaveLength(1)
    expect(got[0].lat).toBe(46.52)
  })

  it('orders by distance, so the nearest fire is the one reported', () => {
    const got = readHotspots([feature(46.6, 8.0), feature(46.51, 8.0)], route)
    expect(got.map((h) => h.lat)).toEqual([46.51, 46.6])
    expect(got[0].distanceM).toBeLessThan(got[1].distanceM)
  })

  it('reads the acquisition time as UTC, which is how GWIS writes it', () => {
    const [h] = readHotspots([feature(46.5, 8.0, { acq_at: '2026-08-14 00:03:00' })], route)
    expect(h.acquiredAtMs).toBe(Date.UTC(2026, 7, 14, 0, 3, 0))
  })

  it('drops undateable detections rather than printing a freshness claim about them', () => {
    expect(readHotspots([feature(46.5, 8.0, { acq_at: '' })], route)).toEqual([])
  })

  it('survives the empty strings GWIS uses for missing attributes', () => {
    const [h] = readHotspots([feature(46.5, 8.0, { frp: '', confidence: '', satellite: '' })], route)
    expect(h.frpMw).toBeNull()
    expect(h.confidence).toBeNull()
    expect(h.satellite).toBeNull()
  })

  it('ignores features with no usable geometry', () => {
    const broken = [
      { geometry: null, properties: {} },
      { geometry: { coordinates: undefined }, properties: {} }
    ]
    expect(readHotspots(broken, route)).toEqual([])
  })
})

/**
 * The invariant this feature lives or dies by: a fetch that fails must never
 * read as "nothing is burning". `none` means the service looked and saw
 * nothing; `error` means nobody looked. The panel says different words for
 * each, so the distinction has to survive down here.
 */
describe('never implies safety', () => {
  const route = [wp(46.5, 8.0)]

  it('separates "saw nothing" from "could not look"', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ type: 'FeatureCollection', features: [] }))
    expect((await fetchWildfires(route)).status).toBe('none')

    vi.stubGlobal('fetch', async () => new Response('boom', { status: 500 }))
    expect((await fetchWildfires(route)).status).toBe('error')
  })

  it('reports a network failure as error rather than throwing into the sync', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const w = await fetchWildfires(route)
    expect(w.status).toBe('error')
    expect(w.hotspots).toEqual([])
    expect(w.nearestM).toBeNull()
  })

  it('reports malformed JSON as error, not as an empty all-clear', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>gateway</html>', { status: 200 }))
    expect((await fetchWildfires(route)).status).toBe('error')
  })

  it('never carries hotspots or a distance unless the status is ok', async () => {
    for (const stub of [
      async () => new Response('boom', { status: 502 }),
      async () => Response.json({ features: [] })
    ]) {
      vi.stubGlobal('fetch', stub)
      const w = await fetchWildfires(route)
      expect(w.status).not.toBe('ok')
      expect(w.hotspots).toEqual([])
      expect(w.nearestM).toBeNull()
      expect(w.latestAtMs).toBeNull()
    }
  })

  it('does not invent an answer for an empty track', async () => {
    const called = vi.fn()
    vi.stubGlobal('fetch', called)
    const w = await fetchWildfires([])
    expect(w.status).toBe('none')
    expect(called).not.toHaveBeenCalled()
  })
})

/**
 * The cap exists so a route through a fire season cannot cost megabytes, but
 * GWIS pages in ingestion order, not by distance. So a full page means the
 * nearest fire may be one that did not fit, and no distance claim survives it.
 */
describe('a truncated response never becomes a distance claim', () => {
  const route = [wp(46.5, 8.0)]
  const full = (n: number) =>
    Array.from({ length: n }, (_, i) => feature(46.5 + i * 0.0001, 8.0))

  it('flags truncation when the service fills the page', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ features: full(500) }))
    const w = await fetchWildfires(route)
    expect(w.status).toBe('ok')
    expect(w.truncated).toBe(true)
  })

  it('does not flag a response that fits', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ features: full(3) }))
    const w = await fetchWildfires(route)
    expect(w.truncated).toBe(false)
  })

  it('refuses to report "none" from a full page, because the near ones may be the dropped ones', async () => {
    // Every returned detection is far outside the radius, but the page was
    // full: reporting 'none' would be an all-clear drawn from a partial read.
    vi.stubGlobal('fetch', async () =>
      Response.json({
        features: Array.from({ length: 500 }, (_, i) => feature(60 + i * 0.0001, 8.0))
      })
    )
    const w = await fetchWildfires(route)
    expect(w.status).toBe('error')
    expect(w.nearestM).toBeNull()
  })
})

describe('fetchWildfires', () => {
  const route = [wp(46.5, 8.0)]

  it('reports the nearest detection and the most recent time among them', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        features: [
          feature(46.6, 8.0, { acq_at: '2026-08-14 00:03:00' }),
          feature(46.51, 8.0, { acq_at: '2026-08-13 10:00:00' })
        ]
      })
    )
    const w = await fetchWildfires(route, Date.UTC(2026, 7, 14, 12))
    expect(w.status).toBe('ok')
    expect(w.hotspots).toHaveLength(2)
    expect(w.nearestM).toBe(w.hotspots[0].distanceM)
    expect(w.nearestM).toBeLessThan(2000)
    expect(w.latestAtMs).toBe(Date.UTC(2026, 7, 14, 0, 3, 0))
  })

  it('asks only for the recent window, so an old burn scar cannot resurface', async () => {
    let asked = ''
    vi.stubGlobal('fetch', async (url: string) => {
      asked = url
      return Response.json({ features: [] })
    })
    const now = Date.UTC(2026, 7, 15, 12)
    const w = await fetchWildfires(route, now)
    const since = new URL(asked).searchParams.get('filter') ?? ''
    const expected = new Date(now - w.windowHours * 3600_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    expect(since).toContain(`<fes:Literal>${expected}</fes:Literal>`)
  })
})
