import { createRoute } from 'honox/factory'
import {
  FWI_MIN_SPINUP_DAYS,
  fwiInputsUrls,
  reduceToNoonInputs,
  stitchHourly,
  type OpenMeteoHourly
} from '../../lib/weather'

/**
 * Fire-weather inputs: months of hourly history reduced to one row per day,
 * sampled at local solar noon as the FWI System requires.
 *
 * Two upstream series are joined here, ERA5 archive for the spin-up and the
 * forecast blend for recent and future days, which is the other reason this is
 * a route: it keeps a two-request fan-out and a ~150 kB reduction off the
 * client, leaving ~7 kB. The codes only advance once a day, so the result is
 * cached hard and shared by everyone on the same grid cell.
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

  const { archive, forecast } = fwiInputsUrls(gridLat, gridLon, days)
  const [aRes, fRes] = await Promise.all([fetch(archive), fetch(forecast)])
  if (!fRes.ok) return c.json({ error: 'fwi_unavailable' }, 502)
  const fJson = (await fRes.json()) as { hourly?: OpenMeteoHourly }
  const aJson = aRes.ok ? ((await aRes.json()) as { hourly?: OpenMeteoHourly }) : null

  const hourly = aJson?.hourly
    ? stitchHourly(aJson.hourly, fJson.hourly ?? {})
    : (fJson.hourly ?? {})
  const rows = reduceToNoonInputs(hourly, gridLon)

  // Without the archive leg only a few days of history survive, and a run that
  // short under-calls the danger class about half the time. Better to report
  // nothing and let the client keep its previous reading.
  if (rows.length < FWI_MIN_SPINUP_DAYS) return c.json({ error: 'fwi_unavailable' }, 502)

  const res = Response.json(rows, {
    headers: { 'cache-control': `public, max-age=${CACHE_SECONDS}` }
  })
  c.executionCtx.waitUntil(cache.put(key, res.clone()))
  return res
})
