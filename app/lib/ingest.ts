import type { MessageKey } from './i18n'
import { clearNotifications } from './notify'
import { clearTrack, set, type Track } from './store'
import { syncNow } from './sync'
import { parseGpx } from './gpx'
import {
  applyPace,
  bboxOf,
  haversineM,
  resample,
  simplifyForMap,
  trackTotals,
  DEFAULT_REST,
  type ProfileId,
  type RestId
} from './track'
import { fillElevations } from './weather'

export type IngestResult = { ok: true; track: Track } | { ok: false; error: MessageKey }

/**
 * Errors travel as message keys, not sentences: ingest runs with no locale of
 * its own (the share receiver calls it too), and the island that shows the
 * result is the thing that knows which language to render.
 */
const SPARSE_ERROR: MessageKey = 'upload.sparse'

export async function ingestGpx(input: {
  xml: string
  name?: string
  shareTitle?: string
  fallbackName?: string
  profile: ProfileId
  rest?: RestId
  startAt?: number | null
}): Promise<IngestResult> {
  let parsed
  try {
    parsed = parseGpx(input.xml)
  } catch {
    return { ok: false, error: 'upload.unparseable' }
  }
  const { points, sparse } = parsed
  if (sparse || points.length < 2) return { ok: false, error: SPARSE_ERROR }

  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1], points[i])
  // No routing engine: sparse input is rejected, never expanded.
  if (total / (points.length - 1) > 200) return { ok: false, error: SPARSE_ERROR }

  let wps = resample(points)

  // Single-source elevation: GPX and DEM are both MSL but differ by metres,
  // so mixing them fabricates ascent at every boundary.
  let eleSource: Track['eleSource'] = 'gpx'
  if (!points.every((p) => p.ele !== null)) {
    try {
      const els = await fillElevations(wps)
      wps = wps.map((w, i) => ({ ...w, eleM: els[i] }))
      eleSource = els.some((e) => e !== null) ? 'dem' : 'none'
    } catch {
      wps = wps.map((w) => ({ ...w, eleM: null }))
      eleSource = 'none'
    }
    // Recompute cumulative ascent from the replacement elevations.
    let cum = 0
    wps = wps.map((w, i) => {
      if (i > 0) {
        const prev = wps[i - 1].eleM
        const cur = w.eleM
        if (prev !== null && cur !== null && cur - prev > 3) cum += cur - prev
      }
      return { ...w, cumAscentM: cum }
    })
  }

  const rest: RestId = input.rest ?? DEFAULT_REST
  /*
   * Totals are measured on the full track, never on the ~60 resampled
   * waypoints: resampling exists for the forecast and straightens switchbacks,
   * which understated distance badly.
   *
   * Distance is always full-resolution. Ascent can only be full-resolution when
   * the GPX carried its own elevation; with the DEM fallback we only have
   * heights at the sampled waypoints, so those totals stay coarse rather than
   * being invented.
   */
  const totals =
    eleSource === 'gpx'
      ? trackTotals(points)
      : trackTotals(
          wps.map((w) => ({ lat: w.lat, lon: w.lon, ele: w.eleM, time: null })),
          0
        )
  const distM = trackTotals(points).distM

  const waypoints = applyPace(wps, input.profile, rest, totals.ascentM)


  const trimmed = input.name?.trim()
  const gpxName = parsed.name !== 'Unnamed track' ? parsed.name : ''
  const shareName = input.shareTitle?.trim()
  const fileName = input.fallbackName?.replace(/\.gpx$/i, '').trim()
  const [name, nameSource]: [string, Track['nameSource']] = trimmed
    ? [trimmed, 'user']
    : gpxName
      ? [gpxName, 'gpx']
      : shareName
        ? [shareName, 'share']
        : fileName
          ? [fileName, 'filename']
          : ['Unnamed hike', 'filename']

  const track: Track = {
    name: name.slice(0, 120),
    nameSource,
    profile: input.profile,
    rest,
    gpxText: input.xml,
    waypoints,
    simplified: simplifyForMap(points),
    bbox: bboxOf(points),
    lengthM: distM,
    ascentM: totals.ascentM,
    descentM: totals.descentM,
    eleSource,
    startAt: input.startAt ?? null,
    addedAt: Date.now()
  }

  // A new track invalidates the warning baseline and any warning still on the
  // lock screen: clearTrack nulls the forecast the diff compares against, and
  // the old notification must not outlive the track it described.
  await clearTrack()
  await clearNotifications()
  await set('track', track)
  try {
    await syncNow()
  } catch {
    // The track is stored; the UI surfaces lastFetchError on its own.
  }
  return { ok: true, track }
}
