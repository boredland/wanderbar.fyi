import { describe, expect, it } from 'vitest'
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

  it('never carries a danger level unless the bulletin is live and in date', async () => {
    for (const p of [[23.4, 12.0], [-44.0, 170.0], [61.6, 8.3], [46.8, 9.83]]) {
      const b = await fetchBulletin([wp(p[0], p[1])])
      if (b.status !== 'ok') expect(b.level, `${p} ${b.status}`).toBeNull()
    }
  }, 30000)
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
