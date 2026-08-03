export type Pt = { lat: number; lon: number; ele: number | null; time: number | null }
export type Waypoint = {
  seq: number
  lat: number
  lon: number
  eleM: number | null
  cumDistM: number
  cumAscentM: number
  etaOffsetS: number
}
export type ProfileId = 'hiking' | 'mountain' | 'running' | 'cycling' | 'ski'

/** Mountain hiking suits the alpine terrain this is mostly used on. */
export const DEFAULT_PROFILE: ProfileId = 'mountain'

export const PROFILES: Record<
  ProfileId,
  { label: string; kmh: number; ascentMh: number; descentMh: number | null }
> = {
  hiking: { label: 'Hiking', kmh: 4, ascentMh: 300, descentMh: 500 },
  mountain: { label: 'Mountain hiking', kmh: 4, ascentMh: 400, descentMh: 800 },
  running: { label: 'Trail running', kmh: 11, ascentMh: 750, descentMh: 1000 },
  cycling: { label: 'Cycling', kmh: 20, ascentMh: 700, descentMh: null },
  ski: { label: 'Ski touring', kmh: 4, ascentMh: 300, descentMh: 1200 }
}

const R_EARTH_M = 6371008.8

/** Elevation deltas below this are DEM/GPS jitter, not climbing. */
const ASCENT_NOISE_M = 3

/**
 * Totals measured on the FULL track, never on the resampled waypoints.
 *
 * Resampling exists to keep the forecast to ~60 points; it straightens
 * switchbacks and smooths the profile, which understated distance by up to 70%
 * and ascent by ~20% on a real trail when these figures were derived from it.
 *
 * `noiseM` is a hysteresis threshold, the same idea every serious tool uses:
 * only count a direction change once it exceeds the sensor's own jitter, so
 * metre-scale GPS wobble does not accumulate into hundreds of phantom metres.
 */
export function trackTotals(
  points: Pt[],
  noiseM = 3
): { distM: number; ascentM: number; descentM: number } {
  let distM = 0
  for (let i = 1; i < points.length; i++) distM += haversineM(points[i - 1], points[i])

  let ascentM = 0
  let descentM = 0
  // Hysteresis: hold a reference height and only commit a gain or loss once the
  // move away from it clears the noise floor.
  let ref: number | null = null
  let dir: 0 | 1 | -1 = 0
  for (const p of points) {
    if (p.ele === null) continue
    if (ref === null) {
      ref = p.ele
      continue
    }
    const delta = p.ele - ref
    if (dir >= 0 && delta >= noiseM) {
      ascentM += delta
      ref = p.ele
      dir = 1
    } else if (dir <= 0 && delta <= -noiseM) {
      descentM += -delta
      ref = p.ele
      dir = -1
    } else if (dir === 1 && delta <= -noiseM) {
      descentM += -delta
      ref = p.ele
      dir = -1
    } else if (dir === -1 && delta >= noiseM) {
      ascentM += delta
      ref = p.ele
      dir = 1
    } else if ((dir === 1 && delta > 0) || (dir === -1 && delta < 0)) {
      // Continuing in the same direction: extend without resetting hysteresis.
      if (dir === 1) ascentM += delta
      else descentM += -delta
      ref = p.ele
    }
  }
  return { distM, ascentM, descentM }
}

/** Horizontal distance only: the pace profiles already price climbing. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLon = (b.lon - a.lon) * toRad
  const la1 = a.lat * toRad
  const la2 = b.lat * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function resample(points: Pt[], spacingM = 2000): Waypoint[] {
  if (points.length === 0) return []
  if (points.length === 1) {
    return [
      {
        seq: 0,
        lat: points[0].lat,
        lon: points[0].lon,
        eleM: points[0].ele,
        cumDistM: 0,
        cumAscentM: 0,
        etaOffsetS: 0
      }
    ]
  }

  let total = 0
  const legs: number[] = []
  for (let i = 1; i < points.length; i++) {
    const d = haversineM(points[i - 1], points[i])
    legs.push(d)
    total += d
  }

  // Cap at 60 waypoints: keeps one Open-Meteo call far inside the rate budget
  // and the map legible.
  const spacing = Math.max(spacingM, total / 59)

  const picked: Pt[] = [points[0]]
  // Along-track distance at each pick. Chords between picks are shorter than the
  // trail itself, so distance must be carried from here rather than re-measured
  // on the sampled polyline.
  const alongM: number[] = [0]
  let travelled = 0
  let nextMark = spacing
  for (let i = 1; i < points.length; i++) {
    const leg = legs[i - 1]
    while (leg > 0 && travelled + leg >= nextMark) {
      const t = (nextMark - travelled) / leg
      const a = points[i - 1]
      const b = points[i]
      picked.push({
        lat: lerp(a.lat, b.lat, t),
        lon: lerp(a.lon, b.lon, t),
        ele: a.ele !== null && b.ele !== null ? lerp(a.ele, b.ele, t) : (b.ele ?? a.ele),
        time: null
      })
      alongM.push(nextMark)
      nextMark += spacing
    }
    travelled += leg
  }
  const last = points[points.length - 1]
  const tail = picked[picked.length - 1]
  if (tail.lat !== last.lat || tail.lon !== last.lon) {
    picked.push(last)
    alongM.push(total)
  }

  const out: Waypoint[] = []
  let cumAscent = 0
  for (let i = 0; i < picked.length; i++) {
    if (i > 0) {
      const prevEle = picked[i - 1].ele
      const ele = picked[i].ele
      if (prevEle !== null && ele !== null) {
        const d = ele - prevEle
        if (d > ASCENT_NOISE_M) cumAscent += d
      }
    }
    out.push({
      seq: i,
      lat: picked[i].lat,
      lon: picked[i].lon,
      eleM: picked[i].ele,
      cumDistM: alongM[i],
      cumAscentM: cumAscent,
      etaOffsetS: 0
    })
  }
  return out
}

/** Seconds for one segment under a profile. Cycling adds climb time linearly. */
export function paceTime(
  profile: ProfileId,
  distM: number,
  ascentM: number,
  descentM: number
): number {
  const p = PROFILES[profile]
  if (p.descentMh === null) {
    return (distM / 1000 / p.kmh + ascentM / p.ascentMh) * 3600
  }
  const th = distM / 1000 / p.kmh
  const tv = ascentM / p.ascentMh + descentM / p.descentMh
  return (Math.max(th, tv) + 0.5 * Math.min(th, tv)) * 3600
}

/**
 * The published profile constants describe *moving* time: DIN 33466 and the SAC
 * scale both exclude breaks. Rather than tuning those numbers by feel, rest is
 * an explicit multiplier the user sets, so the book pace stays recognisable.
 */
export const REST_FACTORS = {
  none: { label: 'No stops', factor: 1 },
  short: { label: 'Short breaks', factor: 1.1 },
  normal: { label: 'Normal breaks', factor: 1.2 },
  leisurely: { label: 'Long breaks', factor: 1.35 }
} as const

export type RestId = keyof typeof REST_FACTORS

/** Most people stop to eat and look at things; moving time alone runs short. */
export const DEFAULT_REST: RestId = 'normal'

/**
 * Applies pace per segment so the ETA curve reflects where the climbing is.
 *
 * `trueAscentM` scales the per-segment climb so it sums to the total measured on
 * the full track. Resampling smooths the profile, so without it the ETA prices a
 * gentler hill than the one being walked.
 */
export function applyPace(
  wps: Waypoint[],
  profile: ProfileId,
  rest: RestId = DEFAULT_REST,
  trueAscentM?: number
): Waypoint[] {
  const factor = REST_FACTORS[rest].factor
  const sampled = wps[wps.length - 1]?.cumAscentM ?? 0
  const climbScale =
    trueAscentM !== undefined && sampled > 0 ? trueAscentM / sampled : 1
  let eta = 0
  return wps.map((w, i) => {
    if (i > 0) {
      const prev = wps[i - 1]
      const dist = w.cumDistM - prev.cumDistM
      const ascent = (w.cumAscentM - prev.cumAscentM) * climbScale
      const drop =
        prev.eleM !== null && w.eleM !== null ? Math.max(0, prev.eleM - w.eleM) : 0
      eta += paceTime(profile, dist, ascent, drop) * factor
    }
    return { ...w, etaOffsetS: eta }
  })
}

export function simplifyForMap(points: Pt[], maxPoints = 500): [number, number][] {
  if (points.length === 0) return []
  const step = Math.ceil(points.length / maxPoints)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const out: [number, number][] = []
  for (let i = 0; i < points.length; i += step) out.push([round(points[i].lat), round(points[i].lon)])
  const last = points[points.length - 1]
  const tail = out[out.length - 1]
  if (!tail || tail[0] !== round(last.lat) || tail[1] !== round(last.lon)) {
    out.push([round(last.lat), round(last.lon)])
  }
  return out
}

export function bboxOf(points: Pt[]): [number, number, number, number] {
  let minLat = Infinity
  let minLon = Infinity
  let maxLat = -Infinity
  let maxLon = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
  }
  return [minLat, minLon, maxLat, maxLon]
}

/** 2D by design: GPS altitude is the wrong datum and too noisy to help. */
export function snapToTrack(
  wps: Waypoint[],
  lat: number,
  lon: number
): { seq: number; distM: number } {
  if (wps.length === 0) return { seq: 0, distM: 0 }
  if (wps.length === 1) return { seq: 0, distM: haversineM(wps[0], { lat, lon }) }

  const meanLat = ((wps[0].lat + wps[wps.length - 1].lat) / 2) * (Math.PI / 180)
  const kx = Math.cos(meanLat) * (Math.PI / 180) * R_EARTH_M
  const ky = (Math.PI / 180) * R_EARTH_M
  const px = lon * kx
  const py = lat * ky

  let best = { seq: 0, distM: Infinity }
  for (let i = 1; i < wps.length; i++) {
    const ax = wps[i - 1].lon * kx
    const ay = wps[i - 1].lat * ky
    const bx = wps[i].lon * kx
    const by = wps[i].lat * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const d = Math.hypot(px - cx, py - cy)
    if (d < best.distM) best = { seq: t < 0.5 ? i - 1 : i, distM: d }
  }
  return best
}

/**
 * The absolute time at which `etaOffsetS === 0`, i.e. the track's start.
 * Every displayed time and every warning window is `anchor + etaOffsetS`, so
 * this is the single place that decides what "now" means for a track.
 *
 * A measured fix wins: it is the only evidence of real progress. Otherwise the
 * user's chosen start is used, which may be in the future for a planned hike.
 * With neither, times assume the hiker leaves now.
 */
export function startAnchorMs(
  wps: Waypoint[],
  lastFix: { at: number; snappedSeq: number } | null,
  startAt: number | null,
  now: number
): number {
  if (lastFix) {
    const reached = wps[Math.min(lastFix.snappedSeq, wps.length - 1)]?.etaOffsetS ?? 0
    return lastFix.at - reached * 1000
  }
  return startAt ?? now
}

/** Waypoint index the hiker has reached; 0 before a planned start. */
export function estimatePosition(
  wps: Waypoint[],
  lastFix: { at: number; snappedSeq: number } | null,
  startAt: number | null,
  now: number
): number {
  if (wps.length === 0) return 0
  const elapsedS = (now - startAnchorMs(wps, lastFix, startAt, now)) / 1000
  let seq = 0
  for (const w of wps) {
    if (w.etaOffsetS <= elapsedS) seq = w.seq
    else break
  }
  return Math.min(seq, wps.length - 1)
}
