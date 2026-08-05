import type { FwiInput } from './fwi'
import type { Waypoint } from './track'

export type Hour = {
  t: number
  tempC: number | null
  apparentC: number | null
  precipMm: number | null
  precipProb: number | null
  snowfallCm: number | null
  /** Snow lying on the ground, metres. Falling snow is `snowfallCm`. */
  snowDepthM: number | null
  windKmh: number | null
  gustKmh: number | null
  code: number | null
  capeJkg: number | null
}

export type WaypointForecast = { seq: number; hours: Hour[]; sun: SunDay[] }

/** Civil sunrise/sunset per local day, used to judge darkness on the track. */
export type SunDay = { sunriseMs: number; sunsetMs: number }

export type MetPoint = {
  hours: Hour[]
  symbolCode: string | null
  probabilityOfThunder: number | null
}

const HOURLY_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'precipitation_probability',
  'snowfall',
  'snow_depth',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'cape',
  'freezing_level_height'
].join(',')

export type OpenMeteoHourly = Record<string, (number | null)[] | string[]>
type OpenMeteoResponse = { hourly?: OpenMeteoHourly; daily?: Record<string, string[]> }

const at = (arr: unknown, i: number): number | null => {
  const v = Array.isArray(arr) ? arr[i] : null
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Open-Meteo is fetched directly by the client: it sends CORS `*`. */
export async function fetchOpenMeteo(
  wps: Waypoint[],
  days: number
): Promise<WaypointForecast[]> {
  if (wps.length === 0) return []
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', wps.map((w) => w.lat.toFixed(4)).join(','))
  url.searchParams.set('longitude', wps.map((w) => w.lon.toFixed(4)).join(','))
  url.searchParams.set('hourly', HOURLY_VARS)
  url.searchParams.set('daily', 'sunrise,sunset')
  url.searchParams.set('forecast_days', String(days))
  url.searchParams.set('timezone', 'UTC')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  const json = (await res.json()) as OpenMeteoResponse | OpenMeteoResponse[]
  // A single location returns a bare object; many return an array.
  const list = Array.isArray(json) ? json : [json]

  // Grid-snapping collapses nearby waypoints onto one cell, so responses are
  // matched to waypoints strictly by array index, never by coordinate.
  return wps.map((w, i) => {
    const hourly = (list[i]?.hourly ?? {}) as OpenMeteoHourly
    const daily = (list[i]?.daily ?? {}) as Record<string, string[]>
    const rises = daily.sunrise ?? []
    const sets = daily.sunset ?? []
    const sun: SunDay[] = rises.map((r, k) => ({
      sunriseMs: Date.parse(`${r}Z`),
      sunsetMs: Date.parse(`${sets[k]}Z`)
    }))
    const times = (hourly.time ?? []) as string[]
    const hours: Hour[] = times.map((t, j) => ({
      t: Date.parse(`${t}Z`),
      tempC: at(hourly.temperature_2m, j),
      apparentC: at(hourly.apparent_temperature, j),
      precipMm: at(hourly.precipitation, j),
      precipProb: at(hourly.precipitation_probability, j),
      snowfallCm: at(hourly.snowfall, j),
      snowDepthM: at(hourly.snow_depth, j),
      windKmh: at(hourly.wind_speed_10m, j),
      gustKmh: at(hourly.wind_gusts_10m, j),
      code: at(hourly.weather_code, j),
      capeJkg: at(hourly.cape, j)
    }))
    return { seq: w.seq, hours, sun }
  })
}

type MetEntry = {
  time: string
  data?: {
    instant?: { details?: Record<string, number | undefined> }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> }
  }
}

/**
 * MET is a display-only cross-check reached through the Worker proxy, which
 * exists solely to send the User-Agent its ToS requires. Every field except
 * temperature, wind and precipitation is optional and region-dependent.
 */
export async function fetchMet(lat: number, lon: number): Promise<MetPoint> {
  const res = await fetch(`/api/met?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
  if (!res.ok) throw new Error(`met ${res.status}`)
  const json = (await res.json()) as { properties?: { timeseries?: MetEntry[] } }
  const series = json?.properties?.timeseries ?? []

  let symbolCode: string | null = null
  let probabilityOfThunder: number | null = null
  const hours: Hour[] = series.map((e) => {
    const d = e.data?.instant?.details ?? {}
    const nextH = e.data?.next_1_hours ?? e.data?.next_6_hours
    const sym = nextH?.summary?.symbol_code
    if (sym && !symbolCode) symbolCode = sym.replace(/_(day|night|polartwilight)$/, '')
    const thunder = nextH?.details?.probability_of_thunder
    if (typeof thunder === 'number' && probabilityOfThunder === null) probabilityOfThunder = thunder

    const wind = d.wind_speed
    const gust = d.wind_speed_of_gust
    return {
      t: Date.parse(e.time),
      tempC: d.air_temperature ?? null,
      apparentC: null,
      precipMm: nextH?.details?.precipitation_amount ?? null,
      precipProb: nextH?.details?.probability_of_precipitation ?? null,
      snowfallCm: null,
      snowDepthM: null,
      windKmh: typeof wind === 'number' ? wind * 3.6 : null,
      gustKmh: typeof gust === 'number' ? gust * 3.6 : null,
      code: null,
      capeJkg: null
    }
  })
  return { hours, symbolCode, probabilityOfThunder }
}

/**
 * Days of history the fire-weather codes spin up over.
 *
 * The codes are recursive, so the run needs a runway before the forecast starts.
 * 120 days is where accuracy stops improving: winter rain resets the Drought
 * Code annually, so history older than the last wet season carries no
 * information, and 240 or 668 days score identically.
 *
 * This exceeds what the forecast endpoint can supply. `past_days` is capped at
 * 93 there, and its reanalysis trails by weeks, so it pads with leading nulls
 * instead of refusing: real data began on the same date whether 70, 85 or 93
 * was asked for, about 68 days back. The archive endpoint covers the rest.
 */
const FWI_SPINUP_DAYS = 120

/**
 * Days at the end of the spin-up taken from the forecast endpoint rather than
 * the archive.
 *
 * The archive is ERA5, which is what CEMS itself runs on and measurably better
 * input than the forecast blend, but it carries no forecast. So the archive
 * supplies the long history and the forecast endpoint takes over shortly before
 * the present and continues into the future.
 *
 * Three days is the measured optimum. Handing over sooner (1 day) loses
 * significance, later (7 days) admits more of the weaker source: against CEMS
 * over 19 days and 121 points, mean absolute error was 5.43 at 1 day, 5.26 at
 * 3, and 5.33 at 7, versus 5.57 for the forecast endpoint alone.
 */
const FWI_HANDOFF_DAYS = 3

/**
 * Fewest days of spin-up that may be reported at all.
 *
 * A short run has not accumulated the Drought Code yet, and it fails in the
 * dangerous direction: against CEMS it under-called the danger class on 49.9%
 * of samples at 9 days of spin-up and 41.4% at 14, against 19% at the full 120,
 * a seventh of those by two classes or more. Since the archive leg supplies the
 * depth, losing it must suppress the reading rather than quietly downgrade it.
 * By 30 days the shortfall is close to gone, which is where this sits.
 */
export const FWI_MIN_SPINUP_DAYS = 30

/**
 * The UTC hour closest to 12:00 local solar time at this longitude.
 *
 * Solar time, not the civil timezone: the FWI System's noon is astronomical,
 * and civil zones are wide and politically skewed enough that using one would
 * sample a visibly different point on the diurnal curve.
 */
export function solarNoonUtcHour(lon: number): number {
  return ((Math.round(12 - lon / 15) % 24) + 24) % 24
}

/** ISO date `offset` days from `from`, in UTC. */
function isoDay(from: number, offset: number): string {
  return new Date(from + offset * 86400_000).toISOString().slice(0, 10)
}

/**
 * The two upstream series that {@link stitchHourly} joins: ERA5 archive for the
 * bulk of the spin-up, forecast blend for the last few days plus the future.
 */
export function fwiInputsUrls(
  lat: number,
  lon: number,
  forecastDays: number,
  now = Date.now()
): { archive: URL; forecast: URL } {
  const coords = (url: URL) => {
    url.searchParams.set('latitude', lat.toFixed(4))
    url.searchParams.set('longitude', lon.toFixed(4))
    url.searchParams.set(
      'hourly',
      'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation'
    )
    url.searchParams.set('timezone', 'UTC')
    return url
  }

  const archive = coords(new URL('https://archive-api.open-meteo.com/v1/archive'))
  archive.searchParams.set('start_date', isoDay(now, -FWI_SPINUP_DAYS))
  // The join is exclusive of this date; the forecast endpoint covers it onward.
  archive.searchParams.set('end_date', isoDay(now, -FWI_HANDOFF_DAYS - 1))

  const forecast = coords(new URL('https://api.open-meteo.com/v1/forecast'))
  forecast.searchParams.set('past_days', String(FWI_HANDOFF_DAYS))
  forecast.searchParams.set('forecast_days', String(Math.min(16, Math.max(1, forecastDays))))

  return { archive, forecast }
}

/**
 * Concatenates the archive series with the forecast series, dropping any
 * forecast hours the archive already covers.
 *
 * Overlap is the norm rather than the exception: `past_days` counts back from
 * the current hour, so the forecast window usually reaches a little further
 * back than the handoff date. Preferring the archive across the overlap keeps
 * the better source wherever both have data, and keeps the seam at one point.
 */
export function stitchHourly(
  archive: OpenMeteoHourly,
  forecast: OpenMeteoHourly
): OpenMeteoHourly {
  const aTimes = (archive.time ?? []) as string[]
  const fTimes = (forecast.time ?? []) as string[]
  if (aTimes.length === 0) return forecast
  if (fTimes.length === 0) return archive

  const last = aTimes[aTimes.length - 1]
  let from = 0
  while (from < fTimes.length && fTimes[from] <= last) from++

  const out: OpenMeteoHourly = {}
  for (const key of Object.keys(archive)) {
    const head = archive[key] as (number | null)[]
    const tail = (forecast[key] ?? []) as (number | null)[]
    out[key] = [...head, ...tail.slice(from)] as OpenMeteoHourly[string]
  }
  return out
}

/**
 * Reduces an hourly UTC series to one FWI input row per day, sampled at local
 * solar noon.
 *
 * The system is calibrated on observations taken at noon local standard time,
 * which is why this samples the hourly series instead of reducing it to daily
 * aggregates: Tmax, RHmean and Wmax each sit on a different point of the
 * diurnal curve than noon does, and the discrepancy compounds through the
 * running moisture codes. This is also how the Copernicus CEMS/GEFF reanalysis
 * derives its inputs per grid cell (Vitolo et al. 2020, Sci Data 7:216).
 *
 * Rain is the exception: the system wants the 24 h total *ending* at noon, so
 * it is accumulated over the preceding day rather than sampled.
 */
export function reduceToNoonInputs(hourly: OpenMeteoHourly, lon: number): FwiInput[] {
  const times = (hourly.time ?? []) as string[]
  const noonHour = solarNoonUtcHour(lon)

  const out: FwiInput[] = []
  for (let i = 0; i < times.length; i++) {
    if (Number(times[i].slice(11, 13)) !== noonHour) continue

    const tempC = at(hourly.temperature_2m, i)
    const rh = at(hourly.relative_humidity_2m, i)
    const windKmh = at(hourly.wind_speed_10m, i)
    if (tempC === null || rh === null || windKmh === null) break

    // Open-Meteo stamps precipitation with the end of the hour it fell in, so
    // the 24 h window ending at noon is the 24 samples through this one.
    let precipMm: number | null = i >= 23 ? 0 : null
    for (let k = i - 23; precipMm !== null && k <= i; k++) {
      const mm = at(hourly.precipitation, k)
      precipMm = mm === null ? null : precipMm + mm
    }
    // A truncated leading window would understate rain, so that day is skipped
    // rather than emitted; a later gap would corrupt the running codes instead.
    if (precipMm === null) {
      if (out.length > 0) break
      continue
    }

    out.push({ t: Date.parse(`${times[i].slice(0, 10)}T00:00:00Z`), tempC, rh, windKmh, precipMm })
  }
  return out
}

/**
 * Daily inputs for the fire-weather system, via the Worker proxy.
 *
 * The proxy exists to shrink the transfer, not to add a key: the hourly series
 * this is derived from is ~60 kB, the reduction ~4 kB, and the result is shared
 * by every hiker on the same grid cell for the rest of the day.
 */
export async function fetchFwiInputs(
  lat: number,
  lon: number,
  forecastDays: number
): Promise<FwiInput[]> {
  const res = await fetch(
    `/api/fwi?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&days=${forecastDays}`
  )
  if (!res.ok) throw new Error(`fwi inputs ${res.status}`)
  return (await res.json()) as FwiInput[]
}

/** Copernicus DEM, orthometric like GPX <ele>. Max 100 coordinates per call. */
export async function fillElevations(wps: Waypoint[]): Promise<(number | null)[]> {
  const out: (number | null)[] = []
  for (let i = 0; i < wps.length; i += 100) {
    const chunk = wps.slice(i, i + 100)
    const url = new URL('https://api.open-meteo.com/v1/elevation')
    url.searchParams.set('latitude', chunk.map((w) => w.lat.toFixed(4)).join(','))
    url.searchParams.set('longitude', chunk.map((w) => w.lon.toFixed(4)).join(','))
    const res = await fetch(url)
    if (!res.ok) throw new Error(`elevation ${res.status}`)
    const json = (await res.json()) as { elevation?: number[] }
    const els = json?.elevation ?? []
    for (let j = 0; j < chunk.length; j++) {
      const v = els[j]
      out.push(typeof v === 'number' && Number.isFinite(v) ? v : null)
    }
  }
  return out
}
