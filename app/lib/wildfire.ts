import { ringsOf, routeToRingsM, type Ring } from './polygon'
import { bboxOf, haversineM, type Waypoint } from './track'

/**
 * Fires that are burning now, which is a different claim from `fire` danger.
 *
 * The `fire` condition in ./warnings is a forecast: the FWI says how readily a
 * fire would spread here if one started. This module says one already has, as
 * observed from orbit. A route can carry extreme danger and no fire, or a low
 * index and a fire two kilometres upwind, so neither substitutes for the other
 * and they are never merged.
 *
 * Like the avalanche bulletin and for the same reason, this is deliberately NOT
 * a `Warning`. Detections are satellite passes, not a forecast: coverage comes
 * in overpasses hours apart, cloud and canopy hide fires, and small or smoky
 * ones are missed outright. Folding that into the timeline would let "no
 * detection" render as the green all-clear, which here would mean telling
 * somebody there is no fire when the satellite simply has not looked yet.
 * Hence `WildfireStatus`: every non-answer is its own state the UI says out
 * loud.
 *
 * What it reports is only what was seen: how many thermal anomalies lie within
 * `RADIUS_M` of the route, how close the nearest is, and when it was observed.
 * It never infers spread, direction or danger from them, because a hotspot is
 * one pixel that was hot at one instant and nothing about where the fire goes
 * next is in the data.
 */

export type WildfireStatus =
  | 'ok'
  /** The service answered, and saw nothing near this route. */
  | 'none'
  /** Network, timeout or parse failure; not the same as no fires. */
  | 'error'

/** One thermal anomaly: a satellite pixel that was hot when it was observed. */
export type Hotspot = {
  lat: number
  lon: number
  /** Metres from the nearest sampled point of the route. */
  distanceM: number
  acquiredAtMs: number
  /** Fire radiative power in MW, the sensor's measure of how much it is putting out. */
  frpMw: number | null
  /** The detection's own confidence, in the provider's words ('low' | 'nominal' | 'high'). */
  confidence: string | null
  /** Which instrument saw it, e.g. 'S-NPP/VIIRS'. */
  satellite: string | null
}

/**
 * A burnt area: the mapped footprint of a fire, as opposed to a hotspot, which
 * is a single hot pixel. This is the shape on the ground, so a route can be
 * beside it or inside it, and `inside` distinguishes those.
 */
export type Burn = {
  /** GWIS's own fire id, stable across the daily re-mapping of a growing fire. */
  fireId: string | null
  /** Metres to the nearest edge; 0 when the route enters the area. */
  distanceM: number
  /** The route passes through the mapped footprint. */
  inside: boolean
  /** Hectares burnt, as mapped so far. */
  areaHa: number | null
  /** First and last observation of this fire, epoch ms. */
  startedAtMs: number | null
  mappedAtMs: number | null
}

export type Wildfires = {
  status: WildfireStatus
  /** Nearest first; empty unless status is 'ok'. */
  hotspots: Hotspot[]
  /** Distance to the nearest detection, or null when there is none. */
  nearestM: number | null
  /** Most recent acquisition among them, or null. */
  latestAtMs: number | null
  /**
   * Mapped fire footprints near the route, nearest first.
   *
   * Separate from `hotspots` and never merged with them: a hotspot says a
   * satellite saw heat at an instant, a burn says how much ground has actually
   * burnt. They are also produced on different cadences, so one can be present
   * without the other, and an empty list here never means no fire.
   */
  burns: Burn[]
  /** Distance to the nearest mapped footprint, or null when there is none. */
  nearestBurnM: number | null
  /** The route crosses a mapped footprint. */
  insideBurn: boolean
  /**
   * The service had more detections than one response carries, so `hotspots`
   * is a sample and `nearestM` is the nearest *seen*, not the nearest there is.
   * The panel must not present it as a clearance when this is set.
   */
  truncated: boolean
  /** How far back detections were asked for, so the UI can say it. */
  windowHours: number
  provider: string
  providerUrl: string
  fetchedAtMs: number
}

const PROVIDER = 'Copernicus EFFIS/GWIS'
const PROVIDER_URL = 'https://forest-fire.emergency.copernicus.eu/'

/**
 * How far from the route a detection is worth naming.
 *
 * A fire this side of the horizon changes the walk: smoke, closed paths, and a
 * front that moves faster than a hiker on a wind-driven day. Much beyond it and
 * every summer route in southern Europe would carry a permanent notice, which
 * teaches people to ignore the panel.
 */
const RADIUS_M = 20_000

/**
 * Detections are kept for two days rather than one.
 *
 * A satellite pass is not continuous coverage: consecutive VIIRS overpasses of
 * the same ground are hours apart and cloud can hide a fire through several of
 * them. A single day's window silently drops fires that are still burning but
 * were last seen 26 hours ago. Two days is long enough to survive that gap and
 * short enough that the reader is not shown last week's burn scar.
 */
const WINDOW_HOURS = 48

/**
 * The bbox around the route, grown by RADIUS_M so it covers every point the
 * radius test could accept. Longitude degrees shorten towards the poles, hence
 * the latitude correction; exact distance filtering happens locally afterwards,
 * so over-asking here costs only a few kilobytes.
 */
export function paddedBbox(
  waypoints: Waypoint[],
  radiusM = RADIUS_M
): [number, number, number, number] {
  const [minLat, minLon, maxLat, maxLon] = bboxOf(waypoints)
  const padLat = radiusM / 111_320
  // Near the poles the cosine correction diverges; clamping keeps the box finite.
  const padLon = padLat / Math.max(0.05, Math.abs(Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)))
  return [
    Math.max(-90, minLat - padLat),
    Math.max(-180, minLon - padLon),
    Math.min(90, maxLat + padLat),
    Math.min(180, maxLon + padLon)
  ]
}

/**
 * A long route through a fire season can match tens of thousands of detections,
 * so the response has to be capped or a hiker on mobile data pays megabytes for
 * it. Measured against GWIS: ~660 bytes per feature, so this is ~330 kB worst
 * case, and most routes return a handful.
 *
 * The cap is dangerous in one specific way, which is why `truncated` exists.
 * The service returns features in its own ingestion order, NOT by distance, so
 * the ones dropped past the cap are an arbitrary subset: the nearest fire can
 * be among them. A truncated response therefore cannot claim to know the
 * nearest, and the panel says so rather than printing a distance that reads as
 * clearance.
 */
const MAX_FEATURES = 500

/**
 * Burnt areas are polygons, not points, so the same cap would cost far more
 * bytes. Measured against GWIS: a median footprint carries 13 vertices and
 * ~590 bytes, the worst seen 77, so 200 is ~120 kB worst case and covers every
 * mapped fire around a route in the seasons that produce them.
 */
const MAX_BURNS = 200

/**
 * Burnt areas are looked back over two weeks, far longer than the 48 hours used
 * for hotspots.
 *
 * The two answer different questions. A hotspot is only interesting while it is
 * hot, so a stale one is noise. A burnt area stays relevant after the flames
 * are out: the path is still closed, the ground is still unstable, and the
 * fire that mapped it a week ago may well be the fire still burning at its
 * edge today. Two weeks keeps a season's active fires without dragging in the
 * whole year's scars.
 */
const BURN_WINDOW_HOURS = 336

const empty = (status: WildfireStatus): Wildfires => ({
  status,
  hotspots: [],
  nearestM: null,
  latestAtMs: null,
  burns: [],
  nearestBurnM: null,
  insideBurn: false,
  truncated: false,
  windowHours: WINDOW_HOURS,
  provider: PROVIDER,
  providerUrl: PROVIDER_URL,
  fetchedAtMs: Date.now()
})

type Feature = {
  geometry?: { coordinates?: [number, number] } | null
  properties?: Record<string, unknown> | null
}

/** A burnt-area feature: same envelope, but the geometry has extent. */
type AreaFeature = {
  geometry?: unknown
  properties?: Record<string, unknown> | null
}

/** GWIS publishes timestamps as UTC without a zone marker. */
function parseAcquired(v: unknown): number | null {
  if (typeof v !== 'string' || v === '') return null
  const ms = Date.parse(`${v.replace(' ', 'T')}Z`)
  return Number.isFinite(ms) ? ms : null
}

/** Missing attributes arrive as '', and Number('') is 0, which would read as a real reading of zero. */
function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/**
 * The WFS filter: a bounding box on the route and a lower bound on acquisition
 * time, in one request. Encoded as OGC Filter XML because the simpler `bbox`
 * parameter cannot be combined with a temporal predicate, and without the
 * temporal half this returns every fire since 2012.
 */
function filterXml(
  bbox: [number, number, number, number],
  sinceMs: number,
  timeField: string
): string {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const since = new Date(sinceMs).toISOString().slice(0, 19).replace('T', ' ')
  return (
    '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2">' +
    '<fes:And>' +
    '<fes:BBOX><fes:ValueReference>geom</fes:ValueReference>' +
    `<gml:Envelope srsName="EPSG:4326"><gml:lowerCorner>${minLat} ${minLon}</gml:lowerCorner>` +
    `<gml:upperCorner>${maxLat} ${maxLon}</gml:upperCorner></gml:Envelope></fes:BBOX>` +
    `<fes:PropertyIsGreaterThan><fes:ValueReference>${timeField}</fes:ValueReference>` +
    `<fes:Literal>${since}</fes:Literal></fes:PropertyIsGreaterThan>` +
    '</fes:And></fes:Filter>'
  )
}

const WFS_BASE = 'https://maps.effis.emergency.copernicus.eu/gwis'

function wfsUrl(
  typeNames: string,
  bbox: [number, number, number, number],
  sinceMs: number,
  timeField: string,
  count: number
): string {
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames,
    outputFormat: 'application/json; subtype=geojson',
    srsName: 'EPSG:4326',
    count: String(count),
    filter: filterXml(bbox, sinceMs, timeField)
  })
  return `${WFS_BASE}?${q}`
}

export function requestUrl(bbox: [number, number, number, number], sinceMs: number): string {
  // `all.hs` is every sensor GWIS ingests: VIIRS on S-NPP, NOAA-20 and
  // NOAA-21, plus MODIS. More passes per day than any single one of them.
  return wfsUrl('ms:all.hs.query', bbox, sinceMs, 'acq_at', MAX_FEATURES)
}

/**
 * Burnt areas are filtered on `finaldate`, the last time the fire was observed,
 * not `initialdate`. A fire that started three weeks ago and is still burning
 * today is exactly the one a hiker needs, and filtering on its start would drop
 * it while keeping a small fire that began and ended yesterday.
 */
export function burnRequestUrl(
  bbox: [number, number, number, number],
  sinceMs: number
): string {
  return wfsUrl('ms:nrt.ba.query', bbox, sinceMs, 'finaldate', MAX_BURNS)
}

/**
 * Distance from a detection to the nearest sampled point of the route.
 *
 * Waypoint spacing means this can overstate the distance by up to half a
 * spacing for a fire beside a long straight leg. That errs towards reporting a
 * fire as slightly further away than it is, never nearer, and the panel prints
 * an approximate distance rather than a clearance.
 */
export function nearestDistanceM(waypoints: Waypoint[], lat: number, lon: number): number {
  let best = Infinity
  for (const w of waypoints) {
    const d = haversineM(w, { lat, lon })
    if (d < best) best = d
  }
  return best
}

export function readHotspots(
  features: Feature[],
  waypoints: Waypoint[],
  radiusM = RADIUS_M
): Hotspot[] {
  const out: Hotspot[] = []
  for (const f of features) {
    const c = f.geometry?.coordinates
    if (!c || c.length < 2) continue
    const [lon, lat] = c
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const distanceM = nearestDistanceM(waypoints, lat, lon)
    if (distanceM > radiusM) continue
    const p = f.properties ?? {}
    const acquiredAtMs = parseAcquired(p.acq_at)
    // A detection with no time cannot be placed in or out of the window, and
    // an undateable fire is not something to print a freshness claim about.
    if (acquiredAtMs === null) continue
    out.push({
      lat,
      lon,
      distanceM,
      acquiredAtMs,
      frpMw: parseNumber(p.frp),
      confidence: str(p.confidence)?.toLowerCase() ?? null,
      satellite: str(p.satellite)
    })
  }
  return out.sort((a, b) => a.distanceM - b.distanceM)
}

/**
 * How far a burnt area may be from the route before it stops being this walk's
 * problem. Wider than the hotspot radius: a mapped footprint is a known,
 * durable obstacle rather than a single hot pixel that may be a false positive,
 * so it is worth naming from further out.
 */
const BURN_RADIUS_M = 30_000

export function readBurns(
  features: AreaFeature[],
  waypoints: Waypoint[],
  radiusM = BURN_RADIUS_M
): Burn[] {
  const out: Burn[] = []
  for (const f of features) {
    const polygons = ringsOf(f.geometry)
    if (polygons.length === 0) continue
    const { distanceM, inside } = routeToRingsM(waypoints, polygons)
    if (!Number.isFinite(distanceM) || distanceM > radiusM) continue
    const p = f.properties ?? {}
    out.push({
      fireId: str(p.fire_id) ?? str(p.id),
      distanceM,
      inside,
      areaHa: parseNumber(p.area_ha),
      startedAtMs: parseAcquired(p.initialdate),
      mappedAtMs: parseAcquired(p.finaldate)
    })
  }
  // Inside first, then by distance: a footprint the route crosses outranks a
  // nearer edge it merely passes.
  return out.sort((a, b) => Number(b.inside) - Number(a.inside) || a.distanceM - b.distanceM)
}

/**
 * Mapped footprints near the route.
 *
 * Resolves to an empty list on any failure rather than throwing. The hotspot
 * leg already decides the overall status, and a burn-area outage must not
 * downgrade a good hotspot answer to `error`: the two are independent products
 * and one being down says nothing about the other.
 */
type BurnResult = {
  burns: Burn[]
  /** The request failed, which is not the same as no burnt areas. */
  failed: boolean
  /** The page was full, so a nearer footprint may not have been returned. */
  truncated: boolean
}

async function fetchBurns(
  waypoints: Waypoint[],
  now: number,
  signal: AbortSignal
): Promise<BurnResult> {
  try {
    const bbox = paddedBbox(waypoints, BURN_RADIUS_M)
    const res = await fetch(burnRequestUrl(bbox, now - BURN_WINDOW_HOURS * 3600_000), { signal })
    if (!res.ok) return { burns: [], failed: true, truncated: false }
    const json = (await res.json()) as { features?: AreaFeature[] }
    const features = json.features ?? []
    return {
      burns: readBurns(features, waypoints),
      failed: false,
      truncated: features.length >= MAX_BURNS
    }
  } catch {
    return { burns: [], failed: true, truncated: false }
  }
}

/**
 * Active fires near a track, or an explicit reason there are none to show.
 *
 * Never throws and never gates a sync: a failure is reported as `error`, which
 * the panel renders as "we could not look", not as "there is no fire".
 */
export async function fetchWildfires(
  waypoints: Waypoint[],
  now = Date.now(),
  timeoutMs = 8000
): Promise<Wildfires> {
  if (waypoints.length === 0) return { ...empty('none'), fetchedAtMs: now }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const url = requestUrl(paddedBbox(waypoints), now - WINDOW_HOURS * 3600_000)
    // Both products are asked for at once: they are independent, and running
    // them in series would double the window in which the abort can fire.
    // allSettled, not all: a rejected hotspot fetch must not discard burnt
    // areas that were successfully mapped across the route.
    const [hotspotRes, burnRes] = await Promise.allSettled([
      fetch(url, { signal: ac.signal }),
      fetchBurns(waypoints, now, ac.signal)
    ])

    const burnOutcome: BurnResult =
      burnRes.status === 'fulfilled'
        ? burnRes.value
        : { burns: [], failed: true, truncated: false }
    const burns = burnOutcome.burns
    const burnFields = {
      burns,
      nearestBurnM: burns.length > 0 ? burns[0].distanceM : null,
      insideBurn: burns.some((b) => b.inside)
    }

    const hotspotsFailed =
      hotspotRes.status === 'rejected' || !hotspotRes.value.ok
    /*
     * A full page from either product means the nearest thing may be one that
     * did not fit, so no distance claim from either survives it.
     */
    let truncated = burnOutcome.truncated

    if (hotspotsFailed) {
      // The hotspot leg is gone, but any burnt area already mapped is still a
      // true fact about this route and is reported rather than thrown away.
      // The status stays 'error' regardless: nobody looked for hotspots, and
      // burns alone are not an all-clear on fires burning right now.
      return { ...empty('error'), ...burnFields, truncated, fetchedAtMs: now }
    }

    const json = (await hotspotRes.value.json()) as { features?: Feature[] }
    const features = json.features ?? []
    // The GeoJSON output carries no numberMatched, so a full page is the only
    // signal that the service had more to give.
    truncated = truncated || features.length >= MAX_FEATURES
    const hotspots = readHotspots(features, waypoints)
    if (hotspots.length === 0) {
      // A mapped footprint is itself a fire near the route, so the answer is
      // 'ok' even with no hotspot: the satellite has not seen heat in 48 h, but
      // the ground has burnt and the panel has something true to report.
      if (burns.length > 0) {
        return { ...empty('ok'), ...burnFields, truncated, fetchedAtMs: now }
      }
      // Nothing within the radius, but the box was full: the detections that
      // did not fit could include one that is. Reporting 'none' here would be
      // the all-clear this module exists to avoid.
      if (truncated) return { ...empty('error'), ...burnFields, fetchedAtMs: now }
      // The hotspot layer saw nothing, but the burnt-area layer never answered.
      // 'none' would promise that both looked, so this is an explicit non-answer.
      if (burnOutcome.failed) return { ...empty('error'), ...burnFields, fetchedAtMs: now }
      return { ...empty('none'), ...burnFields, fetchedAtMs: now }
    }
    return {
      status: 'ok',
      hotspots,
      nearestM: hotspots[0].distanceM,
      latestAtMs: hotspots.reduce((a, h) => (h.acquiredAtMs > a ? h.acquiredAtMs : a), 0),
      ...burnFields,
      truncated,
      windowHours: WINDOW_HOURS,
      provider: PROVIDER,
      providerUrl: PROVIDER_URL,
      fetchedAtMs: now
    }
  } catch {
    return { ...empty('error'), fetchedAtMs: now }
  } finally {
    clearTimeout(timer)
  }
}
