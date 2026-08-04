import { createRoute } from 'honox/factory'
import { fwiInputsUrl, reduceToNoonInputs, type OpenMeteoHourly } from '../../lib/weather'

/**
 * Fire-weather inputs: 60 days of hourly history reduced to one row per day,
 * sampled at local solar noon as the FWI System requires.
 *
 * Reducing here rather than on the client turns a ~60 kB hourly series into
 * ~4 kB, and the codes only advance once a day, so the result is cached hard
 * and shared by everyone on the same grid cell.
 */

/**
 * Coordinates are snapped to a coarse grid before they reach the cache, so
 * nearby hikers share one entry. 0.25 deg matches the CEMS/GEFF grid the
 * fire-danger products are published on, which is finer than the codes
 * meaningfully resolve.
 */
const GRID_DEG = 0.25
const snap = (v: number) => Math.round(v / GRID_DEG) * GRID_DEG

/** A day's codes are fixed once computed, so the reduction is cached that long. */
const CACHE_SECONDS = 86400

export const GET = createRoute(async (c) => {
  const lat = Number(c.req.query('lat'))
  const lon = Number(c.req.query('lon'))
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return c.json({ error: 'bad_lat' }, 400)
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return c.json({ error: 'bad_lon' }, 400)
  const days = Math.min(16, Math.max(1, Math.trunc(Number(c.req.query('days'))) || 1))

  const gridLat = snap(lat)
  const gridLon = snap(lon)

  // The cache key is same-origin and carries only the snapped cell and horizon,
  // so sub-cell jitter between hikers collapses onto one entry. The Cache API
  // rejects keys on another zone, so the upstream URL cannot serve as one.
  const key = new Request(
    new URL(`/api/fwi?lat=${gridLat}&lon=${gridLon}&days=${days}`, c.req.url).toString()
  )
  const cache = (caches as unknown as { default: Cache }).default

  const hit = await cache.match(key)
  if (hit) return hit

  const upstream = await fetch(fwiInputsUrl(gridLat, gridLon, days))
  if (!upstream.ok) return c.json({ error: 'fwi_unavailable' }, 502)
  const json = (await upstream.json()) as { hourly?: OpenMeteoHourly }

  const res = Response.json(reduceToNoonInputs(json.hourly ?? {}, gridLon), {
    headers: { 'cache-control': `public, max-age=${CACHE_SECONDS}` }
  })
  c.executionCtx.waitUntil(cache.put(key, res.clone()))
  return res
})
