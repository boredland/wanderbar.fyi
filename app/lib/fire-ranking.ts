/**
 * How unusual today's fire weather is for this place and this time of year.
 *
 * wanderbar already computes an FWI on the device, and that number answers
 * "how readily would a fire spread here". It cannot answer "is this a normal
 * August here", because that needs a climatology the device does not carry.
 * 60 is a dangerous day in the Alps and an ordinary one in Andalusia, and a
 * reader who does not know the region cannot tell those apart from the index.
 *
 * EFFIS publishes a ranking against its own reanalysis: the percentile of
 * today's FWI among the same date's history. That is the one worth showing,
 * because "worse than 99% of days recorded here" is a sentence a reader can
 * act on without knowing what an FWI of 60 means. The service also carries a
 * standard-deviation anomaly, which is not read: it answers the same question
 * less legibly, and a field nobody renders is a field nobody maintains.
 *
 * This is deliberately NOT wired into the local FWI. The two come from
 * different models over different inputs, so pinning one to the other would
 * present ECMWF's answer as wanderbar's own; see ./fwi for the local one and
 * ../routes/api/fwi.ts for the series it runs on.
 */

/** One day's climatological context, as EFFIS reports it. */
export type FireRankingDay = {
  /** UTC date, yyyy-mm-dd. */
  date: string
  /**
   * Percentile of today's fire weather against the same date in the record,
   * 0-100. 99 means only one day in a hundred was worse here at this time of
   * year.
   */
  percentile: number
}

const WMS_BASE = 'https://maps.effis.emergency.copernicus.eu/gwis'

/**
 * The ECMWF-driven layer group, which covers the globe. EFFIS also publishes a
 * finer Meteo-France grid over Europe, whose query layer is served as an
 * unfilled template (`[FWI]`, `[DANGER_RISK]`) rather than values, and whose
 * horizon is three days rather than eight.
 */
const QUERY_LAYER = 'ecmwf.query'

/**
 * The service answers for about eight days out. Past that it returns an empty
 * table rather than an error, so asking further buys nothing and cannot be
 * told apart from a genuinely absent reading.
 */
export const RANKING_FORECAST_DAYS = 8

/** Half-width of the query box. Small: this is a point query, not a route one. */
const SPAN_DEG = 0.02

const clampLat = (v: number) => Math.max(-90, Math.min(90, v))
const clampLon = (v: number) => Math.max(-180, Math.min(180, v))

export function requestUrl(lat: number, lon: number, date: string): string {
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetFeatureInfo',
    layers: QUERY_LAYER,
    query_layers: QUERY_LAYER,
    // Present but empty, or MapServer 8 rejects the request outright.
    styles: '',
    crs: 'EPSG:4326',
    // A box that runs past the pole or the date line is rejected outright by
    // the service, so a walk at the top of Norway would get no reading at all.
    bbox: [
      clampLat(lat - SPAN_DEG),
      clampLon(lon - SPAN_DEG),
      clampLat(lat + SPAN_DEG),
      clampLon(lon + SPAN_DEG)
    ].join(','),
    width: '3',
    height: '3',
    i: '1',
    j: '1',
    /*
     * The GML output carries only a bounding box, and the plain-text one prints
     * an empty feature. The HTML table is the only representation that has the
     * values in it, which is why this parses markup rather than a data format.
     */
    info_format: 'text/html',
    time: date
  })
  return `${WMS_BASE}?${q}`
}

/*
 * Attributes, whitespace and case are all allowed to vary: this is a rendered
 * template, not a data format, and a stray class or newline in an upstream
 * edit would otherwise silently drop every reading.
 */
const ROW = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi

/**
 * Pulls the labelled rows out of the service's HTML table.
 *
 * A template rather than a reading is the case to catch: the Meteo-France
 * layer answers with the literal `[FWI]` placeholders unfilled, and a
 * `Number('[FWI]')` is NaN, so every value is checked for finiteness rather
 * than trusted because a row was present.
 */
export function parseFeatureInfo(html: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [, label, value] of html.matchAll(ROW)) {
    const n = Number(value.trim())
    if (value.trim() !== '' && Number.isFinite(n)) out[label.trim()] = n
  }
  return out
}

/**
 * Reads one day, or null if the service had nothing for it.
 *
 * Beyond the model horizon the table comes back without rows, which is not a
 * quiet fire season but an absent answer, so it must not become a percentile
 * of zero.
 */
export function readRanking(html: string, date: string): FireRankingDay | null {
  const rows = parseFeatureInfo(html)
  const percentile = rows['Ranking Index']
  // NaN fails every comparison, so it must be excluded by hand rather than by
  // the range check: `NaN < 0` is false and would let it straight through.
  if (percentile === undefined || !Number.isFinite(percentile)) return null
  if (percentile < 0 || percentile > 100) return null
  return { date, percentile }
}

/**
 * Percentiles worth saying out loud.
 *
 * Below the top decile this is not information a hiker can use: "worse than
 * 60% of days" describes an ordinary day in a way that invites ignoring the
 * line entirely, so `null` means print nothing at all.
 *
 * Above it the figure is reported as it stands, rounded down. Rounding down
 * rather than to nearest, so the sentence is one the record supports: a day at
 * 98.9 is beaten by more than 1% of history and must not claim 99. Bands were
 * the obvious alternative and were worse, because three of them turn a
 * measured 98.9 into "worse than 95%", throwing away precision the service
 * actually has in the direction of understating the day.
 */
export function rankingPercentile(percentile: number): number | null {
  // Finiteness first: `NaN < 90` is false, so a bare comparison would fall
  // through and print "worse than NaN% of days".
  if (!Number.isFinite(percentile)) return null
  if (percentile < 90 || percentile > 100) return null
  return Math.floor(percentile)
}

/**
 * Climatological context per day for a point on the route.
 *
 * A point rather than the whole route, and the same midpoint the local FWI
 * already uses: this is a regional, daily figure, and sampling it per waypoint
 * would be several requests describing the same weather.
 *
 * Resolves to an empty list on failure. Like every other fire leg this must
 * never gate a sync, and an empty result means no reading rather than a
 * quiet day.
 */
export async function fetchFireRanking(
  lat: number,
  lon: number,
  days: number,
  now = Date.now(),
  timeoutMs = 8000
): Promise<FireRankingDay[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || days < 1) return []

  const wanted = Math.min(days, RANKING_FORECAST_DAYS)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const dates = Array.from({ length: wanted }, (_, i) =>
      new Date(now + i * 86400_000).toISOString().slice(0, 10)
    )
    const results = await Promise.all(
      dates.map(async (date) => {
        try {
          const res = await fetch(requestUrl(lat, lon, date), { signal: ac.signal })
          if (!res.ok) return null
          return readRanking(await res.text(), date)
        } catch {
          return null
        }
      })
    )
    return results.filter((r): r is FireRankingDay => r !== null)
  } finally {
    clearTimeout(timer)
  }
}
