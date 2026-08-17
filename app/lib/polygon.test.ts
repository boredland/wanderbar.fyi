import { describe, expect, it } from 'vitest'
import { ringsOf, routeToRingsM, type Ring } from './polygon'

/**
 * A square roughly 2.2 km on a side at 46.5 N, written counter-clockwise as
 * GeoJSON asks. Coordinates are [lon, lat].
 */
const square = (lat: number, lon: number, size = 0.02): Ring => [
  [lon, lat],
  [lon + size, lat],
  [lon + size, lat + size],
  [lon, lat + size],
  [lon, lat]
]

const at = (lat: number, lon: number) => ({ lat, lon })

describe('routeToRingsM', () => {
  it('reports zero and inside for a waypoint within the area', () => {
    const got = routeToRingsM([at(46.51, 8.01)], [[square(46.5, 8.0)]])
    expect(got.inside).toBe(true)
    expect(got.distanceM).toBe(0)
  })

  it('measures to the nearest edge, not to a vertex or a centre', () => {
    // Due north of the top edge by 0.01 deg, which is ~1.1 km.
    const got = routeToRingsM([at(46.53, 8.01)], [[square(46.5, 8.0)]])
    expect(got.inside).toBe(false)
    expect(got.distanceM).toBeGreaterThan(1000)
    expect(got.distanceM).toBeLessThan(1200)
  })

  /**
   * The reason this measures segments rather than points. Waypoints are up to
   * 2 km apart, so a fire can sit entirely between two of them: every waypoint
   * is outside the area while the walk goes straight through it.
   */
  it('catches an area the route crosses between two waypoints', () => {
    const route = [at(46.51, 7.9), at(46.51, 8.1)]
    const got = routeToRingsM(route, [[square(46.5, 8.0)]])
    expect(got.inside).toBe(true)
    expect(got.distanceM).toBe(0)
  })

  /**
   * A hole is unburnt ground inside the perimeter. Standing in one is not
   * standing in the fire, and even-odd counting is what makes that fall out.
   */
  it('treats a hole in the perimeter as outside it', () => {
    const outer = square(46.5, 8.0, 0.1)
    const hole = square(46.53, 8.03, 0.04)
    const inHole = routeToRingsM([at(46.55, 8.05)], [[outer, hole]])
    expect(inHole.inside).toBe(false)
    expect(inHole.distanceM).toBeGreaterThan(0)

    const inBurn = routeToRingsM([at(46.51, 8.01)], [[outer, hole]])
    expect(inBurn.inside).toBe(true)
  })

  it('takes the nearest of several areas', () => {
    const far = square(47.5, 8.0)
    const near = square(46.52, 8.0)
    const got = routeToRingsM([at(46.5, 8.01)], [[far], [near]])
    expect(got.distanceM).toBeLessThan(3000)
  })

  it('has no answer for an empty route or no areas', () => {
    expect(routeToRingsM([], [[square(46.5, 8.0)]]).distanceM).toBe(Infinity)
    expect(routeToRingsM([at(46.5, 8.0)], []).distanceM).toBe(Infinity)
  })

  /**
   * Longitude degrees shorten towards the poles. A projection that ignored the
   * reference latitude would report this eastward gap as ~1.1 km rather than
   * the ~380 m it is at 70 N.
   */
  it('scales longitude by latitude, so a polar gap is not overstated', () => {
    const got = routeToRingsM([at(70.0, 8.03)], [[square(70.0, 8.0, 0.02)]])
    expect(got.distanceM).toBeGreaterThan(300)
    expect(got.distanceM).toBeLessThan(500)
  })
})

describe('the edge cases an adversarial review found', () => {
  it('measures across the antimeridian the short way round', () => {
    // 179.99 E and 179.96 E either side of the line: ~2.6 km apart, not 40000.
    const got = routeToRingsM([at(0.0, 179.99)], [[square(0.0, -179.99, 0.02)]])
    expect(got.distanceM).toBeLessThan(5000)
  })

  it('keeps looking after one polygon contains the route, so inside always wins', () => {
    // The containing area is listed last, behind one the route merely passes.
    const beside = square(46.6, 8.0)
    const around = square(46.4, 7.9, 0.4)
    const got = routeToRingsM([at(46.5, 8.0)], [[beside], [around]])
    expect(got.inside).toBe(true)
    expect(got.distanceM).toBe(0)
  })

  it('counts a route touching the perimeter as inside it', () => {
    // Standing on the edge of a burn is not standing outside it.
    const got = routeToRingsM([at(46.5, 8.01)], [[square(46.5, 8.0)]])
    expect(got.inside).toBe(true)
    expect(got.distanceM).toBe(0)
  })

  it('finds a crossing that clips a vertex exactly', () => {
    // Straight through the corner at (8.02, 46.52): floating-point cross
    // products land near zero rather than on it.
    const got = routeToRingsM([at(46.5, 8.0), at(46.54, 8.04)], [[square(46.5, 8.0)]])
    expect(got.inside).toBe(true)
  })
})

describe('ringsOf', () => {
  it('reads a Polygon and a MultiPolygon the same way', () => {
    const poly = { type: 'Polygon', coordinates: [square(46.5, 8.0)] }
    expect(ringsOf(poly)).toHaveLength(1)

    const multi = {
      type: 'MultiPolygon',
      coordinates: [[square(46.5, 8.0)], [square(47.0, 8.0)]]
    }
    expect(ringsOf(multi)).toHaveLength(2)
  })

  /**
   * A malformed geometry must yield nothing rather than a partial ring: a
   * dropped coordinate would silently move the fire towards 0 N 0 E, and a
   * distance measured to that is worse than no distance at all.
   */
  it('drops malformed geometry instead of guessing coordinates', () => {
    expect(ringsOf(null)).toEqual([])
    expect(ringsOf({ type: 'Point', coordinates: [8, 46] })).toEqual([])
    expect(ringsOf({ type: 'Polygon', coordinates: [[[8]]] })).toEqual([])
    expect(ringsOf({ type: 'Polygon', coordinates: [[['a', 46]]] })).toEqual([])
    expect(ringsOf({ type: 'Polygon', coordinates: [[[NaN, 46]]] })).toEqual([])
  })
})
