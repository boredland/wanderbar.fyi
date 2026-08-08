import type { Waypoint } from './track'
import { DANGER_ORDER, fireDanger, type FireDanger } from './fwi'
import type { Hour, SunDay, WaypointForecast } from './weather'

export type Condition =
  | 'rain'
  | 'hail'
  | 'wind'
  | 'snow'
  | 'heat'
  | 'blizzard'
  | 'thunderstorm'
  | 'darkness'
  | 'fire'
  | 'ice'
  | 'coldwind'
  | 'deepsnow'

/**
 * Who said so. Not decoration: a thunderstorm can be raised by Open-Meteo's
 * weather code, by MET's thunder probability, or by both, and fire danger is
 * computed here rather than fetched from anyone. The rest is Open-Meteo.
 */
export type Source = 'open-meteo' | 'met' | 'open-meteo+met' | 'computed'

/**
 * The measured facts behind a warning, not a sentence about them.
 *
 * This used to be a pre-rendered English string, which was wrong twice over.
 * Warnings are persisted in IndexedDB and re-read on every offline start, so a
 * baked sentence pins the language the forecast was fetched in; and numbers
 * were formatted with a hard-coded decimal point, which is not how a German or
 * French reader writes them. Keeping the values lets the render decide both.
 *
 * `diffWarnings` keys on (seq, condition) and never reads this, so changing its
 * shape cannot affect which notifications fire.
 */
export type Detail =
  | { kind: 'rainRate'; mmPerH: number }
  | { kind: 'hailPossible' }
  | { kind: 'gusts'; gustKmh: number }
  | { kind: 'snowfall'; cm: number }
  | { kind: 'snowExpected' }
  | { kind: 'blizzard'; gustKmh: number; tempC: number }
  | { kind: 'instability'; band: InstabilityBand }
  | { kind: 'icePrecip'; code: IceCode }
  | { kind: 'windChill'; feelsC: number; frostbite: FrostbiteBand | null }
  | { kind: 'lyingSnow'; cm: number }
  | { kind: 'heat'; tempC: number }
  | { kind: 'fire'; danger: FireDanger; fwi: number }
  | { kind: 'sunrise'; atMs: number }
  | { kind: 'beforeSunrise'; atMs: number }
  | { kind: 'afterSunset'; atMs: number }
  | { kind: 'dusk'; atMs: number }

/** CAPE bands; see instabilityBand. */
export type InstabilityBand = 'expected' | 'weak' | 'strong' | 'violent' | 'extreme'

/** Environment Canada's frostbite exposure bands, in minutes. */
export type FrostbiteBand = 'under2' | '2to5' | '5to10' | '10to30'

/** The four freezing-precipitation weather codes; see ICE_CODES. */
export type IceCode = 56 | 57 | 66 | 67

export type Warning = {
  seq: number
  condition: Condition
  forecastHour: number
  detail: Detail
  source: Source
}

export type Thresholds = {
  enabled: Record<Condition, boolean>
  heatC: number
  windKmh: number
  rainMm: number
  /** Minimum official danger class that warrants a warning. */
  fireDanger: FireDanger
  /** Wind chill at or below this warrants a warning. */
  windChillC: number
  /** Lying snow at or above this warrants a warning, metres. */
  snowDepthM: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  enabled: {
    rain: true,
    hail: true,
    wind: true,
    snow: true,
    heat: true,
    blizzard: true,
    thunderstorm: true,
    darkness: true,
    fire: true,
    ice: true,
    coldwind: true,
    deepsnow: true
  },
  heatC: 30,
  windKmh: 50,
  rainMm: 2,
  fireDanger: 'high',
  /*
   * Environment Canada calls -28 the onset of frostbite in 10-30 min, but the
   * band above it is already "risk of hypothermia without adequate clothing",
   * which is the decision a hiker actually makes the night before. -15 is
   * inside that band and well clear of an ordinary cold-but-fine winter day.
   */
  windChillC: -15,
  /*
   * 30 cm of lying snow is roughly where an unbroken track stops being a walk:
   * SAC/DAV put trail breaking at 200-250 m/h of ascent against 300 on a made
   * track, i.e. a fifth to a third off the day.
   */
  snowDepthM: 0.3
}

const RAIN_CODES: Record<number, true> = { 61: true, 63: true, 65: true, 80: true, 81: true, 82: true }
const SNOW_CODES: Record<number, true> = { 71: true, 73: true, 75: true, 77: true, 85: true, 86: true }
const THUNDER_CODES: Record<number, true> = { 95: true, 96: true, 99: true }
/** Hail is derived from weather_code: Open-Meteo's `hail` variable is all nulls. */
const HAIL_CODES: Record<number, true> = { 96: true, 99: true }
/**
 * Freezing drizzle and freezing rain. These fall as liquid and glaze on
 * contact, so they land in neither RAIN_CODES nor SNOW_CODES and would
 * otherwise pass in silence: 56/57 are the drizzle pair, 66/67 the rain pair.
 * It is the one winter hazard that looks like nothing from indoors.
 */
const ICE_CODES: Record<number, true> = { 56: true, 57: true, 66: true, 67: true }

/** A warning is about weather where and when the hiker will actually be. */
const ETA_WINDOW_MS = 3600_000

export type MetExtras = { probabilityOfThunder?: number | null }

export function evaluateWarnings(
  thresholds: Thresholds,
  forecast: WaypointForecast[],
  waypoints: Waypoint[],
  currentSeq: number,
  /** Absolute time of etaOffsetS === 0; see startAnchorMs in ./track. */
  anchorMs: number,
  metExtras: Record<number, MetExtras> = {},
  /** Computed FWI per UTC date (yyyy-mm-dd); see runFwi in ./fwi. */
  fwiByDate: Record<string, number> = {}
): Warning[] {
  const bySeq = new Map(waypoints.map((w) => [w.seq, w]))
  const out: Warning[] = []

  for (const wf of forecast) {
    const wp = bySeq.get(wf.seq)
    if (!wp || wp.seq < currentSeq) continue
    const etaMs = anchorMs + wp.etaOffsetS * 1000

    // Fire danger is a daily, regional figure, so it attaches to the waypoint's
    // day rather than joining the hourly window logic.
    if (thresholds.enabled.fire) {
      const date = new Date(etaMs).toISOString().slice(0, 10)
      const value = fwiByDate[date]
      if (value !== undefined) {
        const danger = fireDanger(value)
        if (DANGER_ORDER[danger] >= DANGER_ORDER[thresholds.fireDanger]) {
          out.push({
            seq: wf.seq,
            condition: 'fire',
            forecastHour: etaMs,
            detail: { kind: 'fire', danger, fwi: value },
            source: 'computed'
          })
        }
      }
    }

    // Darkness depends only on where the ETA falls relative to that day's sun
    // times, so it is judged per waypoint rather than per forecast hour.
    if (thresholds.enabled.darkness) {
      const dark = darknessAt(wf.sun, etaMs)
      if (dark) {
        out.push({
          seq: wf.seq,
          condition: 'darkness',
          forecastHour: etaMs,
          detail: dark,
          source: 'open-meteo'
        })
      }
    }

    // A warning's identity is (seq, condition), so several hours inside the
    // window must collapse to one entry: keep the hour closest to the ETA,
    // which is the one the hiker will actually walk through.
    const bestByCondition: Partial<Record<Condition, { w: Warning; gap: number }>> = {}

    for (const h of wf.hours) {
      const gap = Math.abs(h.t - etaMs)
      if (gap > ETA_WINDOW_MS) continue
      const push = (condition: Condition, detail: Detail, source: Source = 'open-meteo') => {
        if (!thresholds.enabled[condition]) return
        const prev = bestByCondition[condition]
        if (prev && prev.gap <= gap) return
        bestByCondition[condition] = {
          w: { seq: wf.seq, condition, forecastHour: h.t, detail, source },
          gap
        }
      }

      const code = h.code
      const precip = h.precipMm ?? 0
      const prob = h.precipProb ?? 0
      const gust = h.gustKmh ?? h.windKmh ?? 0
      const snow = h.snowfallCm ?? 0
      const temp = h.tempC
      const feels = h.apparentC ?? h.tempC

      if (precip >= thresholds.rainMm || (code !== null && RAIN_CODES[code] && prob >= 50)) {
        push('rain', { kind: 'rainRate', mmPerH: precip })
      }
      if (code !== null && HAIL_CODES[code]) push('hail', { kind: 'hailPossible' })

      const metThunder = metExtras[wf.seq]?.probabilityOfThunder
      const omThunder = code !== null && THUNDER_CODES[code]
      const saysThunder = metThunder !== null && metThunder !== undefined && metThunder >= 30
      if (omThunder || saysThunder) {
        push(
          'thunderstorm',
          { kind: 'instability', band: instabilityBand(h.capeJkg) },
          omThunder && saysThunder ? 'open-meteo+met' : saysThunder ? 'met' : 'open-meteo'
        )
      }
      if (gust >= thresholds.windKmh) push('wind', { kind: 'gusts', gustKmh: gust })

      const snowing = snow > 0 || (code !== null && SNOW_CODES[code])
      if (snowing) {
        push('snow', snow > 0 ? { kind: 'snowfall', cm: snow } : { kind: 'snowExpected' })
      }
      if (snowing && gust >= 40 && temp !== null && temp <= 0) {
        push('blizzard', { kind: 'blizzard', gustKmh: gust, tempC: temp })
      }

      if (code !== null && ICE_CODES[code]) {
        push('ice', { kind: 'icePrecip', code: code as IceCode })
      }

      // Wind chill is computed rather than taken from apparent_temperature:
      // that variable also carries humidity and radiation, and measured against
      // JAG/TI on a cold alpine day it sat ~4 °C low in light wind, which is
      // the wrong direction to be wrong about frostbite.
      const chill = windChillC(temp, h.windKmh)
      if (chill !== null && chill <= thresholds.windChillC) {
        push('coldwind', { kind: 'windChill', feelsC: chill, frostbite: frostbiteBand(chill) })
      }

      // Lying snow, not falling snow: the hazard is the walking, not the sky.
      const lying = h.snowDepthM
      if (lying !== null && lying >= thresholds.snowDepthM) {
        push('deepsnow', { kind: 'lyingSnow', cm: lying * 100 })
      }

      const hot = Math.max(temp ?? -Infinity, feels ?? -Infinity)
      if (Number.isFinite(hot) && hot >= thresholds.heatC) push('heat', { kind: 'heat', tempC: hot })
    }

    for (const picked of Object.values(bestByCondition)) {
      if (picked) out.push(picked.w)
    }
  }
  return out
}

/**
 * Wind chill on the JAG/TI 2001 model, the index both the US NWS and
 * Environment Canada publish, in °C from wind at the standard 10 m height.
 *
 * Returns null outside the model's stated validity range rather than
 * extrapolating: above 10 °C there is no chill to report, and at or below
 * 4.8 km/h the air is calm enough that the index collapses to the temperature.
 */
export function windChillC(tempC: number | null, windKmh: number | null): number | null {
  if (tempC === null || windKmh === null) return null
  if (tempC > 10 || windKmh <= 4.8) return null
  const v = windKmh ** 0.16
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v
}

/**
 * Environment Canada's frostbite banding. Only named once the exposure time is
 * short enough to change what a hiker does; above that the number speaks for
 * itself and a phrase would just pad the row.
 */
function frostbiteBand(chillC: number): FrostbiteBand | null {
  if (chillC <= -55) return 'under2'
  if (chillC <= -48) return '2to5'
  if (chillC <= -40) return '5to10'
  if (chillC <= -28) return '10to30'
  return null
}

/** Civil twilight is roughly 30 min either side of the sun crossing. */
const TWILIGHT_MS = 30 * 60_000

/**
 * Returns a human detail when the given time falls in darkness or twilight on
 * the matching day, else null. Uses the day whose sun times bracket the time
 * most closely, so a multi-day track is judged against the right date.
 */
function darknessAt(sun: SunDay[], atMs: number): Detail | null {
  if (sun.length === 0) return null
  let best = sun[0]
  let bestGap = Infinity
  for (const d of sun) {
    const mid = (d.sunriseMs + d.sunsetMs) / 2
    const gap = Math.abs(mid - atMs)
    if (gap < bestGap) {
      bestGap = gap
      best = d
    }
  }
  if (!Number.isFinite(best.sunriseMs) || !Number.isFinite(best.sunsetMs)) return null

  // "Darkness (in the dark)" says nothing; give the boundary that matters.
  if (atMs > best.sunsetMs + TWILIGHT_MS) return { kind: 'sunrise', atMs: best.sunriseMs }
  if (atMs < best.sunriseMs - TWILIGHT_MS) return { kind: 'sunrise', atMs: best.sunriseMs }
  if (atMs < best.sunriseMs) return { kind: 'beforeSunrise', atMs: best.sunriseMs }
  if (atMs > best.sunsetMs) return { kind: 'afterSunset', atMs: best.sunsetMs }
  // Approaching dusk is the case that catches people out on a descent.
  if (best.sunsetMs - atMs <= TWILIGHT_MS) return { kind: 'dusk', atMs: best.sunsetMs }
  return null
}

/**
 * CAPE is convective available potential energy in J/kg: the buoyant energy
 * available to a storm updraft. It is the fuel, not the fire, so it never
 * triggers a warning on its own; it only describes how violent a storm that
 * does fire would be. Bands follow standard convective forecasting practice.
 */
function instabilityBand(capeJkg: number | null): InstabilityBand {
  if (capeJkg === null) return 'expected'
  if (capeJkg < 300) return 'expected'
  if (capeJkg < 1000) return 'weak'
  if (capeJkg < 2500) return 'strong'
  if (capeJkg < 4000) return 'violent'
  return 'extreme'
}

export type Delta = { worsened: Warning[]; cleared: Warning[] }

/**
 * Identity is (seq, condition) and never forecastHour: the hour drifts by
 * minutes on every sync, which would otherwise notify every single time.
 */
export function diffWarnings(prev: Warning[], next: Warning[]): Delta {
  const key = (w: Warning) => `${w.seq}:${w.condition}`
  const prevKeys = new Set(prev.map(key))
  const nextKeys = new Set(next.map(key))

  const seen = new Set<string>()
  const worsened: Warning[] = []
  for (const w of next) {
    const k = key(w)
    if (!prevKeys.has(k) && !seen.has(k)) {
      seen.add(k)
      worsened.push(w)
    }
  }
  seen.clear()
  const cleared: Warning[] = []
  for (const w of prev) {
    const k = key(w)
    if (!nextKeys.has(k) && !seen.has(k)) {
      seen.add(k)
      cleared.push(w)
    }
  }
  return { worsened, cleared }
}
