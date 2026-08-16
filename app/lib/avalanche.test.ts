import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchBulletin,
  inGeometry,
  parseLevel,
  problemLabel,
  withFreshness,
  type Bulletin,
  type DangerLevel
} from './avalanche'
import type { Waypoint } from './track'

/**
 * No test in here may touch the network. These once called four public
 * avalanche services on every run, which failed offline, spent someone else's
 * rate limit to assert nothing, and — worst — asserted the safety invariant
 * only when a provider happened to be *down*: `if (status !== 'ok')` checks
 * nothing on the day the service answers.
 */
const NOW = Date.UTC(2026, 1, 10, 9)

/** A point inside SLF's bbox; Switzerland is the shortest path to CAAML. */
const SWISS = { lat: 46.8, lon: 9.83 }

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

/** One CAAML feature covering a square around the Swiss point. */
const caamlFeature = (over: Record<string, unknown> = {}) => ({
  geometry: {
    type: 'Polygon',
    coordinates: [[[9, 46], [11, 46], [11, 47.5], [9, 47.5], [9, 46]]]
  },
  properties: {
    dangerRatings: [{ mainValue: 'considerable', elevation: { lowerBound: '2200' } }],
    avalancheProblems: [{ problemType: 'persistent_weak_layers' }],
    avalancheActivity: { highlights: 'Weak layers in the old snowpack.' },
    validTime: { endTime: new Date(NOW + 3600_000).toISOString() },
    ...over
  }
})

/** Answers every provider with the same canned response. */
const stubFetch = (respond: (url: string) => Promise<Response>) => {
  const spy = vi.fn((input: RequestInfo | URL) => respond(String(input)))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const wp = (lat: number, lon: number): Waypoint => ({
  seq: 0,
  lat,
  lon,
  eleM: 2000,
  cumDistM: 0,
  cumAscentM: 0,
  etaOffsetS: 0
})

describe('parseLevel', () => {
  it('accepts the EAWS names and the numeric forms both services use', () => {
    expect(parseLevel('considerable')).toBe(3)
    expect(parseLevel('very_high')).toBe(5)
    expect(parseLevel('Very High')).toBe(5)
    // NVE returns the level as a decimal string.
    expect(parseLevel('2')).toBe(2)
    expect(parseLevel(4)).toBe(4)
  })

  it('rejects anything it cannot place on the 1-5 scale', () => {
    // NVE publishes DangerLevel "0" out of season; it is not a danger level.
    expect(parseLevel('0')).toBeNull()
    expect(parseLevel('6')).toBeNull()
    expect(parseLevel('')).toBeNull()
    expect(parseLevel('unknown')).toBeNull()
    expect(parseLevel(null)).toBeNull()
    expect(parseLevel(undefined)).toBeNull()
  })
})

describe('problemLabel', () => {
  it('turns CAAML machine tokens into readable text', () => {
    expect(problemLabel('persistent_weak_layers')).toBe('Persistent weak layers')
    expect(problemLabel('wind_slab')).toBe('Wind slab')
  })
})

describe('inGeometry', () => {
  const square: unknown = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
  }

  it('locates a point inside and outside a region', () => {
    expect(inGeometry(square, 5, 5)).toBe(true)
    expect(inGeometry(square, 15, 5)).toBe(false)
    expect(inGeometry(square, 5, -5)).toBe(false)
  })

  it('excludes holes, so an enclave is not credited to the surrounding region', () => {
    const withHole = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
      ]
    }
    expect(inGeometry(withHole, 5, 5)).toBe(false)
    expect(inGeometry(withHole, 2, 2)).toBe(true)
  })

  it('handles MultiPolygon, which is what SLF actually serves', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]]]
      ]
    }
    expect(inGeometry(multi, 21, 21)).toBe(true)
    expect(inGeometry(multi, 10, 10)).toBe(false)
  })

  it('treats missing or unsupported geometry as not matching', () => {
    expect(inGeometry(null, 5, 5)).toBe(false)
    expect(inGeometry({ type: 'Point', coordinates: [5, 5] }, 5, 5)).toBe(false)
  })
})

/**
 * The one invariant that matters: this feature must never imply safety. Every
 * path that is not a live, in-date bulletin has to carry a null level and a
 * status the UI renders as "unknown".
 */
describe('never implies safety', () => {
  it('reports no coverage rather than silence where no service reaches', async () => {
    // Mid-Sahara: no avalanche service on earth covers this.
    const b = await fetchBulletin([wp(23.4, 12.0)])
    expect(b.status).toBe('no-coverage')
    expect(b.level).toBeNull()
  })

  it('returns an explicit non-answer for an empty track', async () => {
    const b = await fetchBulletin([])
    expect(b.status).toBe('no-coverage')
    expect(b.level).toBeNull()
  })

  it('carries a level only when the bulletin is live and in date', async () => {
    stubFetch(() => json({ features: [caamlFeature()] }))
    const b = await fetchBulletin([wp(SWISS.lat, SWISS.lon)], NOW)
    expect(b.status).toBe('ok')
    expect(b.level).toBe(3)
  })

  it('drops the level when the bulletin has expired', async () => {
    // Observed for real: a "latest" endpoint served a May bulletin in August.
    stubFetch(() =>
      json({
        features: [
          caamlFeature({ validTime: { endTime: new Date(NOW - 86400_000).toISOString() } })
        ]
      })
    )
    const b = await fetchBulletin([wp(SWISS.lat, SWISS.lon)], NOW)
    expect(b.status).toBe('stale')
    expect(b.level).toBeNull()
    expect(b.bands).toEqual([])
    expect(b.problems).toEqual([])
  })

  it('says out-of-season, not safe, when the service publishes nothing', async () => {
    stubFetch(() => json({ features: [] }))
    const b = await fetchBulletin([wp(SWISS.lat, SWISS.lon)], NOW)
    expect(b.status).toBe('out-of-season')
    expect(b.level).toBeNull()
  })

  it('says no-coverage when the point falls outside every published region', async () => {
    stubFetch(() =>
      json({
        features: [
          {
            geometry: {
              type: 'Polygon',
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
            },
            properties: caamlFeature().properties
          }
        ]
      })
    )
    const b = await fetchBulletin([wp(SWISS.lat, SWISS.lon)], NOW)
    expect(b.status).toBe('no-coverage')
    expect(b.level).toBeNull()
  })

  it('reports an upstream failure as error rather than as no danger', async () => {
    stubFetch(() => json({}, 500))
    const b = await fetchBulletin([wp(SWISS.lat, SWISS.lon)], NOW)
    expect(b.status).toBe('error')
    expect(b.level).toBeNull()
  })

  it('reports a dropped connection as error rather than as no danger', async () => {
    stubFetch(() => Promise.reject(new Error('offline')))
    const b = await fetchBulletin([wp(SWISS.lat, SWISS.lon)], NOW)
    expect(b.status).toBe('error')
    expect(b.level).toBeNull()
  })
})

describe('withFreshness', () => {
  const live: Bulletin = {
    status: 'ok',
    level: 3,
    provider: 'test',
    providerUrl: 'https://example.invalid/',
    region: 'Somewhere',
    headline: 'Weak layers in the old snowpack.',
    bands: [{ level: 3, aboveM: 2200, belowM: null }],
    problems: ['Persistent weak layers'],
    validUntilMs: 1_000,
    fetchedAtMs: 0
  }

  it('keeps a bulletin inside its validity window', () => {
    expect(withFreshness(live, 999).status).toBe('ok')
    expect(withFreshness(live, 999).level).toBe(3)
  })

  it('drops the level entirely once expired, not just the label', () => {
    // Observed for real: avalanche.report's "latest" served a May bulletin in
    // August. A greyed-out "3" still reads as "3" on a trailhead in the cold.
    const old = withFreshness(live, 1_001)
    expect(old.status).toBe('stale')
    expect(old.level).toBeNull()
    expect(old.bands).toEqual([])
    expect(old.problems).toEqual([])
  })

  it('leaves an already-unknown bulletin alone', () => {
    const none = { ...live, status: 'no-coverage' as const, level: null }
    expect(withFreshness(none, 9e15).status).toBe('no-coverage')
  })

  it('keeps a bulletin with no stated expiry rather than inventing one', () => {
    expect(withFreshness({ ...live, validUntilMs: null }, 9e15).status).toBe('ok')
  })
})

describe('an Avalanche Canada bulletin', () => {
  /** A point in AVCAN's bbox and outside every other provider's. */
  const ROGERS_PASS = { lat: 51.3, lon: -117.5 }

  const avcanBody = {
    url: 'https://avalanche.ca/forecasts/glacier',
    area: { name: 'Glacier' },
    report: {
      dangerRatings: [
        {
          ratings: {
            alp: { rating: { value: '4' } },
            tln: { rating: { value: '3' } },
            btl: { rating: { value: '2' } }
          }
        }
      ],
      highlights: '<p>Large avalanches in the alpine.</p>',
      problems: [{ type: 'wind_slab' }],
      validUntil: new Date(NOW + 3600_000).toISOString()
    }
  }

  it('reports the highest of the three tiers as the danger level', async () => {
    // Rounding down is the unsafe direction, and the route may cross all three.
    stubFetch(() => json(avcanBody))
    const b = await fetchBulletin([wp(ROGERS_PASS.lat, ROGERS_PASS.lon)], NOW)

    expect(b.status).toBe('ok')
    expect(b.level).toBe(4)
    expect(b.region).toBe('Glacier')
  })

  it('emits no elevation band, because the bulletin states no altitude', async () => {
    // `Band` is an altitude split and the panel renders it as one. Avalanche
    // Canada names tiers instead, so a Band built from them renders as
    // "overall: High · overall: Moderate": two rows that locate nothing. The
    // tiers reach the reader through the level and the bulletin's own words.
    stubFetch(() => json(avcanBody))
    const b = await fetchBulletin([wp(ROGERS_PASS.lat, ROGERS_PASS.lon)], NOW)

    expect(b.bands).toEqual([])
    expect(b.headline).toBe('Large avalanches in the alpine.')
  })
})

describe('a route crossing regions inside one service', () => {
  /**
   * The sampling rule is documented as "where the sampled points disagree, the
   * higher danger wins, because under-reporting is the direction that gets
   * people killed". That has to hold within a provider, not only across them.
   */
  const swissTrack = (): Waypoint[] =>
    Array.from({ length: 9 }, (_, i) => ({
      seq: i,
      lat: 46.0 + i * 0.2,
      lon: 9.83,
      eleM: 2000,
      cumDistM: i * 1000,
      cumAscentM: 0,
      etaOffsetS: i * 3600
    }))

  /** A CAAML region covering one latitude band, rated as given. */
  const region = (south: number, north: number, mainValue: string) => ({
    geometry: {
      type: 'Polygon',
      coordinates: [[[9, south], [11, south], [11, north], [9, north], [9, south]]]
    },
    properties: {
      dangerRatings: [{ mainValue }],
      avalancheProblems: [],
      avalancheActivity: { highlights: `${mainValue} here` },
      validTime: { endTime: new Date(NOW + 3600_000).toISOString() }
    }
  })

  it('reports the highest danger among the points it sampled', async () => {
    // Quiet at the trailhead, loaded where the route ends up.
    stubFetch(() =>
      json({
        features: [region(45.9, 46.9, 'low'), region(46.9, 48, 'high')]
      })
    )

    const b = await fetchBulletin(swissTrack(), NOW)

    expect(b.status).toBe('ok')
    expect(b.level).toBe(4)
    expect(b.headline).toContain('high')
  })

  it('answers from a later point when the first is outside every region', async () => {
    // A bbox is coarse: the start can sit in it and outside the real polygon.
    stubFetch(() => json({ features: [region(47.0, 48, 'considerable')] }))

    const b = await fetchBulletin(swissTrack(), NOW)

    expect(b.status).toBe('ok')
    expect(b.level).toBe(3)
  })

  it('asks once when the sampled points collapse onto one coordinate', async () => {
    // Sixty lookups would hammer four public services to re-derive one number;
    // the sampling budget is the reason this is three points and not sixty.
    const spy = stubFetch(() => json({ features: [region(45.9, 48, 'moderate')] }))
    const oneSpot: Waypoint[] = [0, 1, 2].map((i) => ({
      seq: i,
      lat: 46.8,
      lon: 9.83,
      eleM: 2000,
      cumDistM: 0,
      cumAscentM: 0,
      etaOffsetS: i * 3600
    }))

    await fetchBulletin(oneSpot, NOW)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('downloads a country-wide bulletin once, not once per sampled point', async () => {
    // SLF publishes one GeoJSON document for all of Switzerland. Fetching it
    // per point would pull the same megabyte three times over one bar of
    // signal, which is the opposite of what the sparse sampling is for.
    const spy = stubFetch(() => json({ features: [region(45.9, 48, 'moderate')] }))
    await fetchBulletin(swissTrack(), NOW)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('never asks a service more than the three points it sampled', async () => {
    const spy = stubFetch(() => json({ features: [region(45.9, 48, 'moderate')] }))
    await fetchBulletin(swissTrack(), NOW)
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

describe('a service that answers per coordinate', () => {
  /** Three distinct points across Avalanche Canada's bbox. */
  const canadianTrack = (): Waypoint[] =>
    [0, 1, 2].map((i) => ({
      seq: i,
      lat: 50 + i,
      lon: -117.5,
      eleM: 2000,
      cumDistM: i * 1000,
      cumAscentM: 0,
      etaOffsetS: i * 3600
    }))

  const avcanAt = (level: string) => ({
    url: 'https://avalanche.ca/forecasts/x',
    area: { name: `Area ${level}` },
    report: {
      dangerRatings: [{ ratings: { alp: { rating: { value: level } } } }],
      highlights: '',
      problems: [],
      validUntil: new Date(NOW + 3600_000).toISOString()
    }
  })

  it('asks each sampled point, because the answer differs per coordinate', async () => {
    const spy = stubFetch((url) => {
      const lat = Number(new URL(url).searchParams.get('lat'))
      return json(avcanAt(lat > 51.5 ? '4' : '1'))
    })

    const b = await fetchBulletin(canadianTrack(), NOW)

    expect(spy).toHaveBeenCalledTimes(3)
    // The loaded end of the route decides, not the trailhead.
    expect(b.level).toBe(4)
  })
})
