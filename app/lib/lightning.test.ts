import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchLightning,
  lightningBand,
  LIGHTNING_FORECAST_DAYS,
  readDensity,
  requestUrl,
  routeBbox
} from './lightning'
import type { Waypoint } from './track'

const wp = (lat: number, lon: number, seq = 0): Waypoint => ({
  seq,
  lat,
  lon,
  eleM: 500,
  cumDistM: 0,
  cumAscentM: 0,
  etaOffsetS: 0
})

/** A 3x3 float raster in the shape the WMS serves one. */
function raster(values: number[]): ArrayBuffer {
  const tags: [number, number, number][] = [
    [256, 3, 3],
    [257, 3, 3],
    [258, 3, 32],
    [259, 3, 1],
    [277, 3, 1],
    [278, 3, 3],
    [339, 3, 3],
    [273, 4, 0],
    [279, 4, values.length * 4]
  ]
  const ifdAt = 8
  const dataAt = ifdAt + 2 + tags.length * 12 + 4
  const buf = new ArrayBuffer(dataAt + values.length * 4)
  const view = new DataView(buf)
  view.setUint16(0, 0x4949, true)
  view.setUint16(2, 42, true)
  view.setUint32(4, ifdAt, true)
  view.setUint16(ifdAt, tags.length, true)
  tags.forEach(([tag, type, value], i) => {
    const at = ifdAt + 2 + i * 12
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, 1, true)
    if (type === 3) view.setUint16(at + 8, tag === 273 ? dataAt : value, true)
    else view.setUint32(at + 8, tag === 273 ? dataAt : value, true)
  })
  values.forEach((v, i) => view.setFloat32(dataAt + i * 4, v, true))
  return buf
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lightningBand', () => {
  it('uses the bands EFFIS draws on its own legend', () => {
    expect(lightningBand(0.5)).toBe('very low')
    expect(lightningBand(1.2)).toBe('low')
    expect(lightningBand(2.0)).toBe('moderate')
    expect(lightningBand(3.0)).toBe('high')
    expect(lightningBand(7.5)).toBe('very high')
    expect(lightningBand(20)).toBe('extreme')
  })

  /**
   * EFFIS renders nothing below 0.25, so wanderbar names nothing there either:
   * a seventh class would put a word on the screen where the issuing service
   * shows blank.
   */
  it('has no band below the lowest one EFFIS renders', () => {
    expect(lightningBand(0.24)).toBeNull()
    expect(lightningBand(0)).toBeNull()
  })

  it('puts each boundary in the higher band, so a threshold is inclusive', () => {
    expect(lightningBand(0.25)).toBe('very low')
    expect(lightningBand(2.5)).toBe('high')
    expect(lightningBand(15)).toBe('extreme')
  })
})

describe('requestUrl', () => {
  it('asks for the values rather than a picture of them', () => {
    const url = new URL(requestUrl([46, 8, 47, 9], '2026-08-17'))
    expect(url.searchParams.get('format')).toBe('image/tiff')
    expect(url.searchParams.get('layers')).toBe('ecmwf.extra.lightning')
    expect(url.searchParams.get('time')).toBe('2026-08-17')
    expect(url.searchParams.get('bbox')).toBe('46,8,47,9')
  })

  /**
   * Two service quirks, both measured against the live WMS: a 1x1 window reads
   * 0 where a 3x3 over the same box reads a real value, and MapServer 8
   * rejects a request that omits STYLES entirely.
   */
  it('sends a window with extent and an empty STYLES, which the service demands', () => {
    const url = new URL(requestUrl([46, 8, 47, 9], '2026-08-17'))
    expect(Number(url.searchParams.get('width'))).toBeGreaterThan(1)
    expect(Number(url.searchParams.get('height'))).toBeGreaterThan(1)
    expect(url.searchParams.get('styles')).toBe('')
  })
})

describe('routeBbox', () => {
  const box = (wps: Waypoint[]) => {
    const b = routeBbox(wps)
    if (!b) throw new Error('expected a box')
    return b
  }

  it('never asks for a box thinner than a grid cell', () => {
    // A due-north route has no longitude span at all.
    const [minLat, minLon, maxLat, maxLon] = box([wp(46.5, 8.0), wp(46.6, 8.0)])
    expect(maxLon - minLon).toBeGreaterThan(0.1)
    expect(maxLat - minLat).toBeGreaterThan(0.09)
  })

  it('leaves a box that is already wide enough alone', () => {
    const [, minLon, , maxLon] = box([wp(46.5, 8.0), wp(46.6, 9.0)])
    expect(minLon).toBe(8.0)
    expect(maxLon).toBe(9.0)
  })

  it('stays inside valid coordinates at the poles', () => {
    const [minLat, minLon, maxLat, maxLon] = box([wp(89.99, 179.99)])
    expect(minLat).toBeGreaterThanOrEqual(-90)
    expect(maxLat).toBeLessThanOrEqual(90)
    expect(minLon).toBeGreaterThanOrEqual(-180)
    expect(maxLon).toBeLessThanOrEqual(180)
  })

  /**
   * A box spanning the globe the long way round would put a storm on the far
   * side of the planet in the same few pixels as the walk, so there is no
   * honest reading to take.
   */
  it('refuses a route that wraps the antimeridian rather than boxing the world', () => {
    expect(routeBbox([wp(-17.8, 179.9), wp(-17.8, -179.9)])).toBeNull()
  })

  it('has no box for an empty route', () => {
    expect(routeBbox([])).toBeNull()
  })
})

describe('request resolution', () => {
  /**
   * The renderer resamples whatever it is given. Nine pixels over a 2-degree
   * route would average a single storm cell away, and averaging away the one
   * cell that matters is the failure mode this warning exists to avoid.
   */
  it('asks for at least one pixel per model cell on a long route', () => {
    const b = routeBbox([wp(46.0, 8.0), wp(48.0, 10.0)])
    if (!b) throw new Error('expected a box')
    const url = new URL(requestUrl(b, '2026-08-17'))
    expect(Number(url.searchParams.get('width'))).toBeGreaterThanOrEqual(20)
    expect(Number(url.searchParams.get('height'))).toBeGreaterThanOrEqual(20)
  })

  it('still sends a window with extent for a single point', () => {
    const b = routeBbox([wp(46.5, 8.0)])
    if (!b) throw new Error('expected a box')
    const url = new URL(requestUrl(b, '2026-08-17'))
    expect(Number(url.searchParams.get('width'))).toBeGreaterThanOrEqual(3)
  })
})

describe('readDensity', () => {
  it('takes the worst cell the route passes through', () => {
    expect(readDensity(raster([0, 0, 0, 0, 1, 0, 0, 0, 4.5]), true)).toBe(4.5)
  })

  it('has no reading at all when the bytes are not a raster', () => {
    const html = new TextEncoder().encode('<html>error</html>')
    expect(readDensity(html.buffer as ArrayBuffer, true)).toBeNull()
  })

  /** A negative flash density is not a quiet sky, it is a broken read. */
  it('rejects a negative density rather than reporting it as calm', () => {
    expect(readDensity(raster([-1, -1, -1, -1, -1, -1, -1, -1, -1]), true)).toBeNull()
  })
})

describe('fetchLightning', () => {
  const route = [wp(49.375, 11.325)]

  it('reports a day per forecast date, dated in UTC', async () => {
    vi.stubGlobal('fetch', async () => new Response(raster(Array(9).fill(3.0))))
    const days = await fetchLightning(route, 3, Date.UTC(2026, 7, 17, 12))
    expect(days.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
    expect(days[0].flashesPerKm2).toBe(3)
  })

  /**
   * The model runs out around six days, and past that the service answers with
   * an all-zero raster. That is indistinguishable from a genuinely quiet day,
   * so those days must never be asked for.
   */
  it('never asks beyond the horizon the model actually runs to', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return new Response(raster(Array(9).fill(1)))
    })
    await fetchLightning(route, 16)
    expect(asked).toHaveLength(LIGHTNING_FORECAST_DAYS)
  })

  /**
   * Like the fire and avalanche legs: a failure must leave the sync standing.
   * An empty list means no reading, and the UI must not render that as calm.
   */
  it('resolves empty on failure rather than throwing into the sync', async () => {
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 502 }))
    expect(await fetchLightning(route, 3)).toEqual([])

    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    expect(await fetchLightning(route, 3)).toEqual([])
  })

  it('keeps the days it could read when only some fail', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      new URL(url).searchParams.get('time') === '2026-08-18'
        ? new Response('boom', { status: 502 })
        : new Response(raster(Array(9).fill(2)))
    )
    const days = await fetchLightning(route, 3, Date.UTC(2026, 7, 17, 12))
    expect(days.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-19'])
  })

  it('does not call the service for an empty route', async () => {
    const called = vi.fn()
    vi.stubGlobal('fetch', called)
    expect(await fetchLightning([], 3)).toEqual([])
    expect(called).not.toHaveBeenCalled()
  })
})
