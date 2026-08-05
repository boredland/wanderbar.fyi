import type { Waypoint } from './track'

/**
 * Avalanche danger is deliberately NOT a `Warning`.
 *
 * Every other condition in this app is computed from a forecast, per waypoint,
 * per hour, and absence of one is meaningful: no rain warning means the models
 * say it will not rain. Avalanche danger inverts both halves of that.
 *
 * It cannot be computed. Danger is governed by the structure of the snowpack —
 * buried persistent weak layers laid down weeks earlier — which no forecast
 * variable exposes. The fire-danger precedent ("computed, not fetched") must
 * therefore be read backwards here: fire had no API and a defensible model,
 * avalanche has real APIs and no defensible model. So this module only ever
 * relays an official bulletin, and never derives one.
 *
 * And absence is not safety. Most of the world has no bulletin at all, the
 * services that do publish run only in winter, and a fetch can simply fail.
 * Folding that into the warning list would render it as the green "No
 * un-wanderbar weather ahead" verdict, i.e. an all-clear on a loaded slope,
 * which is the worst thing this app could say. Hence `BulletinStatus`: every
 * non-answer is its own explicit state that the UI must render as *unknown*,
 * never as safe.
 *
 * Finally, a bulletin is regional and daily. This app knows neither slope angle
 * nor aspect, so it must never claim a given waypoint is safe or unsafe. The
 * bulletin is reported for the route as a whole, in the region's own words.
 */

/** EAWS danger levels; the same 1-5 scale is used by NVE and Avalanche Canada. */
export type DangerLevel = 1 | 2 | 3 | 4 | 5

export const DANGER_LABEL: Record<DangerLevel, string> = {
  1: 'Low',
  2: 'Moderate',
  3: 'Considerable',
  4: 'High',
  5: 'Very high'
}

/**
 * Why there is no number, when there is none. Each is a distinct state the UI
 * must be able to say out loud, because "we could not tell you" and "it is
 * fine" are different sentences and only one of them is honest.
 */
export type BulletinStatus =
  | 'ok'
  /** Outside every service this app knows how to ask. Most of the world. */
  | 'no-coverage'
  /** Service covers here but publishes nothing today, typically summer. */
  | 'out-of-season'
  /** A bulletin came back, but its validity window has passed. */
  | 'stale'
  /** Network or parse failure. */
  | 'error'

export type Bulletin = {
  status: BulletinStatus
  /** Null unless status is 'ok'. */
  level: DangerLevel | null
  /** The issuing service, named so the user can go read the real thing. */
  provider: string
  providerUrl: string
  region: string | null
  /** The bulletin's own headline, in its own words. Never paraphrased. */
  headline: string | null
  /** Danger by elevation band, when the bulletin splits it. */
  bands: Band[]
  problems: string[]
  validUntilMs: number | null
  fetchedAtMs: number
}

/** A danger rating that applies only above or below some altitude. */
export type Band = { level: DangerLevel; aboveM: number | null; belowM: number | null }

const LEVEL_BY_NAME: Record<string, DangerLevel> = {
  low: 1,
  moderate: 2,
  considerable: 3,
  high: 4,
  very_high: 5,
  'very high': 5
}

export function parseLevel(v: unknown): DangerLevel | null {
  if (typeof v === 'number' && v >= 1 && v <= 5) return Math.round(v) as DangerLevel
  if (typeof v !== 'string') return null
  const n = Number(v)
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n) as DangerLevel
  return LEVEL_BY_NAME[v.trim().toLowerCase().replace(/\s+/g, '_')] ?? null
}

/** CAAML problem ids are snake_case machine tokens; make them readable. */
export function problemLabel(id: string): string {
  const s = id.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const unavailable = (status: BulletinStatus, provider = '', providerUrl = ''): Bulletin => ({
  status,
  level: null,
  provider,
  providerUrl,
  region: null,
  headline: null,
  bands: [],
  problems: [],
  validUntilMs: null,
  fetchedAtMs: Date.now()
})

/**
 * Ray casting against a GeoJSON ring, lon/lat order.
 *
 * Plane geometry on degrees is wrong in general, but a bulletin region is tens
 * of kilometres and never spans the antimeridian or a pole, so the error is far
 * below the resolution of the answer: regions are drawn along ridgelines and a
 * point near enough to an edge to flip is a point where both regions' bulletins
 * are worth reading anyway.
 */
function inRing(ring: number[][], lat: number, lon: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** True when the point is inside the outer ring and outside every hole. */
function inPolygon(poly: number[][][], lat: number, lon: number): boolean {
  if (poly.length === 0 || !inRing(poly[0], lat, lon)) return false
  for (let h = 1; h < poly.length; h++) if (inRing(poly[h], lat, lon)) return false
  return true
}

export function inGeometry(geometry: unknown, lat: number, lon: number): boolean {
  const g = geometry as { type?: string; coordinates?: unknown }
  if (!g?.type) return false
  if (g.type === 'Polygon') return inPolygon(g.coordinates as number[][][], lat, lon)
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).some((p) => inPolygon(p, lat, lon))
  }
  return false
}

/**
 * A bulletin whose validity window has closed is reported as `stale` rather
 * than shown: yesterday's number on today's snow is the most confident way this
 * feature could be wrong. Verified in practice — the ALBINA "latest" endpoint
 * served a bulletin dated May when queried in August.
 */
export function withFreshness(b: Bulletin, now: number): Bulletin {
  if (b.status !== 'ok') return b
  if (b.validUntilMs === null || now <= b.validUntilMs) return b
  // The level is dropped, not greyed out. A number on screen is read as the
  // number regardless of what surrounds it, and this one describes past snow.
  return { ...b, status: 'stale', level: null, bands: [], problems: [] }
}

type Provider = {
  name: string
  url: string
  /** Rough bounds, so we only ask a service about ground it covers. */
  bbox: [number, number, number, number]
  fetch: (lat: number, lon: number, signal: AbortSignal) => Promise<Bulletin>
}

const NVE: Provider = {
  name: 'Varsom / NVE',
  url: 'https://varsom.no/',
  bbox: [57, 4, 72, 32],
  async fetch(lat, lon, signal) {
    const day = new Date().toISOString().slice(0, 10)
    const res = await fetch(
      `https://api01.nve.no/hydrology/forecast/avalanche/v6.3.0/api/AvalancheWarningByCoordinates/Simple/${lat.toFixed(4)}/${lon.toFixed(4)}/en/${day}/${day}`,
      { signal }
    )
    if (!res.ok) throw new Error(`nve ${res.status}`)
    const rows = (await res.json()) as Record<string, unknown>[]
    const row = rows?.[0]
    if (!row) return unavailable('out-of-season', NVE.name, NVE.url)
    const level = parseLevel(row.DangerLevel)
    // NVE returns DangerLevel "0" out of season rather than omitting the row.
    if (level === null) return unavailable('out-of-season', NVE.name, NVE.url)
    return {
      status: 'ok',
      level,
      provider: NVE.name,
      providerUrl: NVE.url,
      region: typeof row.RegionName === 'string' ? row.RegionName : null,
      headline: typeof row.MainText === 'string' ? row.MainText : null,
      bands: [],
      problems: [],
      validUntilMs: typeof row.ValidTo === 'string' ? Date.parse(`${row.ValidTo}Z`) : null,
      fetchedAtMs: Date.now()
    }
  }
}

const AVCAN: Provider = {
  name: 'Avalanche Canada',
  url: 'https://avalanche.ca/',
  bbox: [44, -141, 71, -52],
  async fetch(lat, lon, signal) {
    const res = await fetch(
      `https://api.avalanche.ca/forecasts/en/products/point?lat=${lat.toFixed(4)}&long=${lon.toFixed(4)}`,
      { signal }
    )
    if (res.status === 404) return unavailable('no-coverage', AVCAN.name, AVCAN.url)
    if (!res.ok) throw new Error(`avcan ${res.status}`)
    const j = (await res.json()) as Record<string, any>
    const today = j?.report?.dangerRatings?.[0]?.ratings
    // Highest of the three elevation bands: the route may cross all of them and
    // this number is only ever a pointer to the real bulletin.
    const levels = [today?.alp?.rating, today?.tln?.rating, today?.btl?.rating]
      .map((r) => parseLevel(r?.value ?? r))
      .filter((l): l is DangerLevel => l !== null)
    if (levels.length === 0) return unavailable('out-of-season', AVCAN.name, AVCAN.url)
    const bands: Band[] = []
    const alp = parseLevel(today?.alp?.rating?.value ?? today?.alp?.rating)
    const btl = parseLevel(today?.btl?.rating?.value ?? today?.btl?.rating)
    if (alp !== null) bands.push({ level: alp, aboveM: null, belowM: null })
    if (btl !== null && btl !== alp) bands.push({ level: btl, aboveM: null, belowM: null })
    return {
      status: 'ok',
      level: Math.max(...levels) as DangerLevel,
      provider: AVCAN.name,
      providerUrl: typeof j?.url === 'string' ? j.url : AVCAN.url,
      region: typeof j?.area?.name === 'string' ? j.area.name : null,
      headline: typeof j?.report?.highlights === 'string' ? stripHtml(j.report.highlights) : null,
      bands: [],
      problems: (j?.report?.problems ?? [])
        .map((p: any) => (typeof p?.type === 'string' ? problemLabel(p.type) : null))
        .filter((s: string | null): s is string => !!s),
      validUntilMs: typeof j?.report?.validUntil === 'string' ? Date.parse(j.report.validUntil) : null,
      fetchedAtMs: Date.now()
    }
  }
}

/** Bulletin highlights arrive as small HTML fragments; the UI renders text. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * CAAML v6 danger ratings, as published by SLF and ALBINA.
 *
 * Ratings are split by elevation band and by time of day ('earlier'/'later'),
 * so there is no single honest number. The headline figure is the highest of
 * them, because rounding down is the unsafe direction, and the bands are kept
 * alongside so the UI can show where the split actually falls rather than
 * flattening it away.
 */
function readCaaml(
  ratings: any[],
  problems: any[]
): { level: DangerLevel | null; bands: Band[]; problems: string[] } {
  const bands: Band[] = []
  let level: DangerLevel | null = null
  for (const r of ratings ?? []) {
    const l = parseLevel(r?.mainValue)
    if (l === null) continue
    if (level === null || l > level) level = l
    const above = r?.elevation?.lowerBound
    const below = r?.elevation?.upperBound
    bands.push({
      level: l,
      aboveM: above !== undefined ? Number(above) : null,
      belowM: below !== undefined ? Number(below) : null
    })
  }
  const seen = new Set<string>()
  const names: string[] = []
  for (const p of problems ?? []) {
    if (typeof p?.problemType !== 'string') continue
    const label = problemLabel(p.problemType)
    if (seen.has(label)) continue
    seen.add(label)
    names.push(label)
  }
  return { level, bands, problems: names }
}

const SLF: Provider = {
  name: 'SLF',
  url: 'https://www.slf.ch/en/avalanche-bulletin-and-snow-situation.html',
  bbox: [45.7, 5.8, 47.9, 10.6],
  async fetch(lat, lon, signal) {
    const res = await fetch('https://aws.slf.ch/api/bulletin/caaml/en/geojson', { signal })
    if (!res.ok) throw new Error(`slf ${res.status}`)
    const j = (await res.json()) as { features?: any[] }
    const features = j?.features ?? []
    // Empty collection is how SLF says "no bulletin right now", i.e. summer.
    if (features.length === 0) return unavailable('out-of-season', SLF.name, SLF.url)
    const hit = features.find((f) => inGeometry(f?.geometry, lat, lon))
    if (!hit) return unavailable('no-coverage', SLF.name, SLF.url)
    const p = hit.properties ?? {}
    const { level, bands, problems } = readCaaml(p.dangerRatings, p.avalancheProblems)
    if (level === null) return unavailable('out-of-season', SLF.name, SLF.url)
    return {
      status: 'ok',
      level,
      provider: SLF.name,
      providerUrl: SLF.url,
      region: p.regions?.[0]?.name ?? null,
      headline: p.avalancheActivity?.highlights ?? null,
      bands,
      problems,
      validUntilMs: p.validTime?.endTime ? Date.parse(p.validTime.endTime) : null,
      fetchedAtMs: Date.now()
    }
  }
}

/**
 * ALBINA covers the Euregio (Tyrol, South Tyrol, Trentino).
 *
 * Its JSON carries region *ids* but no geometry, and bundling EAWS region
 * polygons would ship a shapefile that silently rots whenever the services
 * redistrict. So coverage is decided by bounding box and the bulletin is
 * reported with its region names visible, letting the reader confirm the match
 * rather than having the app assert one it cannot verify.
 */
const ALBINA: Provider = {
  name: 'avalanche.report',
  url: 'https://avalanche.report/',
  bbox: [45.6, 10.4, 47.8, 12.5],
  async fetch(_lat, _lon, signal) {
    const res = await fetch(
      'https://static.avalanche.report/bulletins/latest/EUREGIO_en_CAAMLv6.json',
      { signal }
    )
    if (!res.ok) throw new Error(`albina ${res.status}`)
    const j = (await res.json()) as { bulletins?: any[] }
    const list = j?.bulletins ?? []
    if (list.length === 0) return unavailable('out-of-season', ALBINA.name, ALBINA.url)
    // Without geometry the region cannot be resolved, so the strongest rating
    // in the collection is reported and named as covering the whole Euregio.
    let best: { b: any; level: DangerLevel } | null = null
    for (const b of list) {
      const { level } = readCaaml(b?.dangerRatings, b?.avalancheProblems)
      if (level !== null && (best === null || level > best.level)) best = { b, level }
    }
    if (!best) return unavailable('out-of-season', ALBINA.name, ALBINA.url)
    const { bands, problems } = readCaaml(best.b.dangerRatings, best.b.avalancheProblems)
    return {
      status: 'ok',
      level: best.level,
      provider: ALBINA.name,
      providerUrl: ALBINA.url,
      region: 'Euregio (highest of region)',
      headline: best.b?.avalancheActivity?.highlights ?? null,
      bands,
      problems,
      validUntilMs: best.b?.validTime?.endTime ? Date.parse(best.b.validTime.endTime) : null,
      fetchedAtMs: Date.now()
    }
  }
}

const PROVIDERS: Provider[] = [NVE, SLF, ALBINA, AVCAN]

const inBbox = (p: Provider, lat: number, lon: number) =>
  lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3]

/**
 * The bulletin covering a track, or an explicit reason there is none.
 *
 * Sampled at a few points rather than all sixty: a bulletin is regional, and
 * sixty lookups would hammer four public services to re-derive one number.
 * Where the sampled points disagree — a route crossing a region boundary — the
 * higher danger wins, because under-reporting is the direction that gets people
 * killed.
 *
 * This function never returns "safe". Its failure values are 'no-coverage',
 * 'out-of-season', 'stale' and 'error', all of which mean *we do not know*, and
 * the UI is required to say so in those words.
 */
export async function fetchBulletin(
  waypoints: Waypoint[],
  now = Date.now(),
  timeoutMs = 8000
): Promise<Bulletin> {
  if (waypoints.length === 0) return unavailable('no-coverage')

  const idx = [...new Set([0, waypoints.length >> 1, waypoints.length - 1])]
  const points = idx.map((i) => waypoints[i])

  const jobs: Promise<Bulletin>[] = []
  for (const p of PROVIDERS) {
    const covered = points.filter((w) => inBbox(p, w.lat, w.lon))
    if (covered.length === 0) continue
    const w = covered[0]
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    jobs.push(
      p
        .fetch(w.lat, w.lon, ac.signal)
        .catch(() => unavailable('error', p.name, p.url))
        .finally(() => clearTimeout(timer))
    )
  }
  // Nowhere on this track is covered by a service we know how to ask.
  if (jobs.length === 0) return unavailable('no-coverage')

  const results = (await Promise.all(jobs)).map((b) => withFreshness(b, now))
  const live = results.filter((b) => b.status === 'ok')
  if (live.length > 0) {
    return live.reduce((a, b) => ((b.level ?? 0) > (a.level ?? 0) ? b : a))
  }
  // No number. Report the most informative reason, worst first: a stale
  // bulletin is a stronger signal than silence, and an error is worth showing
  // over "no coverage" because it may simply be a dropped connection.
  const order: BulletinStatus[] = ['stale', 'error', 'out-of-season', 'no-coverage']
  for (const s of order) {
    const hit = results.find((b) => b.status === s)
    if (hit) return hit
  }
  return unavailable('no-coverage')
}
