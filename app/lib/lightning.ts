import { centreValue, maxValue, readFloatRaster } from './geotiff'
import { bboxOf, type Waypoint } from './track'

/**
 * Forecast lightning density, which is an ignition risk rather than a weather
 * inconvenience.
 *
 * wanderbar already warns about thunderstorms, and this is not that. That
 * warning is about the hiker: being on a ridge under a storm. This is about the
 * ground: dry lightning is how a fire starts where there is nobody to start
 * one, so it belongs beside the fire danger and not beside the rain.
 *
 * The two do not move together, which is the whole reason to carry it. Measured
 * at 43.5 N 6.0 E for 2026-08-21, the ECMWF fire danger collapsed from 41.9 to
 * 0.26 while flash density spiked to 28 per km^2: a storm wets the fuel and
 * delivers the ignition source in the same afternoon. A reader watching only
 * the danger index sees the risk drop at the exact moment ignitions arrive.
 *
 * ECMWF publishes it as cloud-to-ground flashes per km^2 over 24 h at ~0.1 deg,
 * out to about six days. EFFIS documents the layer as covering the European
 * Union; measured against the service it returns values worldwide, so no
 * geographic gate is applied here and an absent reading is simply absent.
 */

/** Flashes per square kilometre over the 24 h ending at the forecast day. */
export type LightningDay = {
  /** UTC date, yyyy-mm-dd. */
  date: string
  /** Density along the route, the worst cell the route passes through. */
  flashesPerKm2: number
}

/**
 * The bands EFFIS itself renders the layer in, taken from its legend graphic
 * rather than invented here, so a reader comparing wanderbar against the EFFIS
 * map finds the same words.
 */
export type LightningBand = 'very low' | 'low' | 'moderate' | 'high' | 'very high' | 'extreme'

const BANDS: { min: number; band: LightningBand }[] = [
  { min: 15, band: 'extreme' },
  { min: 5, band: 'very high' },
  { min: 2.5, band: 'high' },
  { min: 1.5, band: 'moderate' },
  { min: 1, band: 'low' },
  { min: 0.25, band: 'very low' }
]

/**
 * Below the lowest band EFFIS draws there is no band at all: the layer renders
 * nothing under 0.25, and inventing a seventh class would put a colour on the
 * map where the issuing service shows blank.
 */
export function lightningBand(flashesPerKm2: number): LightningBand | null {
  for (const { min, band } of BANDS) {
    if (flashesPerKm2 >= min) return band
  }
  return null
}

export const LIGHTNING_ORDER: Record<LightningBand, number> = {
  'very low': 0,
  low: 1,
  moderate: 2,
  high: 3,
  'very high': 4,
  extreme: 5
}

const WMS_BASE = 'https://maps.effis.emergency.copernicus.eu/gwis'
const LAYER = 'ecmwf.extra.lightning'

/**
 * The grid is ~0.1 deg, so a window smaller than a cell would ask the renderer
 * to resample rather than report. This is the smallest box that still contains
 * a whole cell at any latitude the route can reach.
 */
const MIN_SPAN_DEG = 0.15

/**
 * The raster is sampled over a window rather than at a point, because the
 * service returns zero for a 1x1 GetMap even where a 3x3 over the same box
 * returns a real value. Verified against the live service on 2026-08-17: a
 * 1x1 at 49.375 N 11.325 E read 0.000 where a 3x3 read 1.649.
 */
const MIN_GRID = 3

/**
 * The model grid, in degrees. Asking for fewer pixels than the box has cells
 * makes the renderer resample, which either skips cells or averages a local
 * peak away; a day's storm cell is exactly the thing that must not be averaged
 * out. Asking for more costs nothing but bytes, and the cap keeps a very long
 * route from requesting a large image.
 */
const CELL_DEG = 0.1
const MAX_GRID = 64

const gridFor = (span: number): number =>
  Math.max(MIN_GRID, Math.min(MAX_GRID, Math.ceil(span / CELL_DEG)))

/**
 * How far past the requested day the service still answers. Measured at nine
 * days for the fire-danger layers and six for this one; asking beyond it costs
 * a request and returns an all-zero raster, which is indistinguishable from a
 * genuinely quiet day and so must not be requested at all.
 */
export const LIGHTNING_FORECAST_DAYS = 6

export function requestUrl(bbox: [number, number, number, number], date: string): string {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const width = gridFor(maxLon - minLon)
  const height = gridFor(maxLat - minLat)
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: LAYER,
    // Present but empty. MapServer 8 rejects a request with no STYLES at all,
    // which is why this is not simply omitted.
    styles: '',
    crs: 'EPSG:4326',
    bbox: `${minLat},${minLon},${maxLat},${maxLon}`,
    width: String(width),
    height: String(height),
    // The values themselves, not a picture of them; see ./geotiff.
    format: 'image/tiff',
    time: date
  })
  return `${WMS_BASE}?${q}`
}

/**
 * A box around the route, never smaller than one grid cell.
 *
 * A route is a line, and a line can have zero width in one axis: a due-north
 * walk has an empty longitude span, which would be a degenerate box the service
 * cannot render.
 */
export function routeBbox(waypoints: Waypoint[]): [number, number, number, number] | null {
  if (waypoints.length === 0) return null
  const [minLat, minLon, maxLat, maxLon] = bboxOf(waypoints)
  /*
   * A route that crosses the antimeridian has its longitudes at both ends of
   * the range, so the plain box spans the globe the long way round. Rendered
   * over a handful of pixels, a storm on the far side of the planet would land
   * in the same box as the walk. Better no reading than that one.
   */
  if (maxLon - minLon > 180) return null
  const padLat = Math.max(0, (MIN_SPAN_DEG - (maxLat - minLat)) / 2)
  const padLon = Math.max(0, (MIN_SPAN_DEG - (maxLon - minLon)) / 2)
  return [
    Math.max(-90, minLat - padLat),
    Math.max(-180, minLon - padLon),
    Math.min(90, maxLat + padLat),
    Math.min(180, maxLon + padLon)
  ]
}

export const utcDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/**
 * Reads one day's density for a route.
 *
 * The maximum over the window rather than its centre: the question is whether
 * the walk passes under a storm at all, and a route that crosses one cell of
 * high density has that risk even if the middle of the box is quiet. For a
 * single-cell window the two agree anyway.
 */
export function readDensity(buffer: ArrayBuffer, wholeRoute: boolean): number | null {
  const raster = readFloatRaster(buffer)
  if (!raster) return null
  const v = wholeRoute ? maxValue(raster) : centreValue(raster)
  if (v === null || !Number.isFinite(v) || v < 0) return null
  return v
}

/**
 * Lightning density per day along a route, for as far ahead as the model runs.
 *
 * Resolves to an empty list rather than throwing: like the fire and avalanche
 * legs, this must never gate a sync. An empty result means no reading, which is
 * not the same as no lightning, and the caller must not render it as quiet.
 */
export async function fetchLightning(
  waypoints: Waypoint[],
  days: number,
  now = Date.now(),
  timeoutMs = 8000
): Promise<LightningDay[]> {
  if (waypoints.length === 0 || days < 1) return []

  const bbox = routeBbox(waypoints)
  if (!bbox) return []
  const wanted = Math.min(days, LIGHTNING_FORECAST_DAYS)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const dates = Array.from({ length: wanted }, (_, i) => utcDate(now + i * 86400_000))
    const results = await Promise.all(
      dates.map(async (date) => {
        try {
          const res = await fetch(requestUrl(bbox, date), { signal: ac.signal })
          if (!res.ok) return null
          const density = readDensity(await res.arrayBuffer(), true)
          return density === null ? null : { date, flashesPerKm2: density }
        } catch {
          return null
        }
      })
    )
    return results.filter((r): r is LightningDay => r !== null)
  } finally {
    clearTimeout(timer)
  }
}
