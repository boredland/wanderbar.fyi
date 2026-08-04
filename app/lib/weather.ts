import type { FwiInput } from './fwi'
import type { Waypoint } from './track'

export type Hour = {
  t: number
  tempC: number | null
  apparentC: number | null
  precipMm: number | null
  precipProb: number | null
  snowfallCm: number | null
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
      windKmh: typeof wind === 'number' ? wind * 3.6 : null,
      gustKmh: typeof gust === 'number' ? gust * 3.6 : null,
      code: null,
      capeJkg: null
    }
  })
  return { hours, symbolCode, probabilityOfThunder }
}

/** 60 days of spin-up is enough for FFMC and DMC to converge; DC keeps drifting. */
const FWI_SPINUP_DAYS = 60

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

/** The upstream hourly series behind {@link reduceToNoonInputs}. */
export function fwiInputsUrl(lat: number, lon: number, forecastDays: number): URL {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat.toFixed(4))
  url.searchParams.set('longitude', lon.toFixed(4))
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation')
  url.searchParams.set('past_days', String(FWI_SPINUP_DAYS))
  url.searchParams.set('forecast_days', String(Math.min(16, Math.max(1, forecastDays))))
  url.searchParams.set('timezone', 'UTC')
  return url
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
