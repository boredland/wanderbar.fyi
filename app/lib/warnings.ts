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

export type Warning = {
  seq: number
  condition: Condition
  forecastHour: number
  detail: string
}

export type Thresholds = {
  enabled: Record<Condition, boolean>
  heatC: number
  windKmh: number
  rainMm: number
  /** Minimum official danger class that warrants a warning. */
  fireDanger: FireDanger
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
    fire: true
  },
  heatC: 30,
  windKmh: 50,
  rainMm: 2,
  fireDanger: 'high'
}

const RAIN_CODES: Record<number, true> = { 61: true, 63: true, 65: true, 80: true, 81: true, 82: true }
const SNOW_CODES: Record<number, true> = { 71: true, 73: true, 75: true, 77: true, 85: true, 86: true }
const THUNDER_CODES: Record<number, true> = { 95: true, 96: true, 99: true }
/** Hail is derived from weather_code: Open-Meteo's `hail` variable is all nulls. */
const HAIL_CODES: Record<number, true> = { 96: true, 99: true }

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
            detail: `${danger}, FWI ${value.toFixed(0)}`
          })
        }
      }
    }

    // Darkness depends only on where the ETA falls relative to that day's sun
    // times, so it is judged per waypoint rather than per forecast hour.
    if (thresholds.enabled.darkness) {
      const dark = darknessAt(wf.sun, etaMs)
      if (dark) out.push({ seq: wf.seq, condition: 'darkness', forecastHour: etaMs, detail: dark })
    }

    // A warning's identity is (seq, condition), so several hours inside the
    // window must collapse to one entry: keep the hour closest to the ETA,
    // which is the one the hiker will actually walk through.
    const bestByCondition: Partial<Record<Condition, { w: Warning; gap: number }>> = {}

    for (const h of wf.hours) {
      const gap = Math.abs(h.t - etaMs)
      if (gap > ETA_WINDOW_MS) continue
      const push = (condition: Condition, detail: string) => {
        if (!thresholds.enabled[condition]) return
        const prev = bestByCondition[condition]
        if (prev && prev.gap <= gap) return
        bestByCondition[condition] = {
          w: { seq: wf.seq, condition, forecastHour: h.t, detail },
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
        push('rain', `${precip.toFixed(1)} mm/h rain`)
      }
      if (code !== null && HAIL_CODES[code]) push('hail', 'hail possible')

      const metThunder = metExtras[wf.seq]?.probabilityOfThunder
      if (
        (code !== null && THUNDER_CODES[code]) ||
        (metThunder !== null && metThunder !== undefined && metThunder >= 30)
      ) {
        const cape = h.capeJkg
        push(
          'thunderstorm',
          cape !== null && cape >= 1000 ? `thunderstorm (CAPE ${Math.round(cape)})` : 'thunderstorm'
        )
      }
      if (gust >= thresholds.windKmh) push('wind', `gusts ${Math.round(gust)} km/h`)

      const snowing = snow > 0 || (code !== null && SNOW_CODES[code])
      if (snowing) push('snow', snow > 0 ? `${snow.toFixed(1)} cm snow` : 'snow')
      if (snowing && gust >= 40 && temp !== null && temp <= 0) {
        push('blizzard', `snow, gusts ${Math.round(gust)} km/h at ${temp.toFixed(0)} °C`)
      }

      const hot = Math.max(temp ?? -Infinity, feels ?? -Infinity)
      if (Number.isFinite(hot) && hot >= thresholds.heatC) push('heat', `${hot.toFixed(1)} °C`)
    }

    for (const picked of Object.values(bestByCondition)) {
      if (picked) out.push(picked.w)
    }
  }
  return out
}

/** Civil twilight is roughly 30 min either side of the sun crossing. */
const TWILIGHT_MS = 30 * 60_000

/**
 * Returns a human detail when the given time falls in darkness or twilight on
 * the matching day, else null. Uses the day whose sun times bracket the time
 * most closely, so a multi-day track is judged against the right date.
 */
function darknessAt(sun: SunDay[], atMs: number): string | null {
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

  const hhmm = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (atMs < best.sunriseMs - TWILIGHT_MS || atMs > best.sunsetMs + TWILIGHT_MS) {
    return 'in the dark'
  }
  if (atMs < best.sunriseMs) return `before sunrise ${hhmm(best.sunriseMs)}`
  if (atMs > best.sunsetMs) return `after sunset ${hhmm(best.sunsetMs)}`
  // Approaching dusk is the case that catches people out on a descent.
  if (best.sunsetMs - atMs <= TWILIGHT_MS) return `dusk, sunset ${hhmm(best.sunsetMs)}`
  return null
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
