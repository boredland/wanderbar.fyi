import { fetchBulletin } from './avalanche'
import { runFwi } from './fwi'
import { fetchLightning } from './lightning'
import { get, set } from './store'
import { estimatePosition, startAnchorMs } from './track'
import { diffWarnings, evaluateWarnings, type Delta, type MetExtras } from './warnings'
import { fetchFwiInputs, fetchMet, fetchOpenMeteo, type Hour } from './weather'
import { fetchWildfires } from './wildfire'

const EMPTY: Delta = { worsened: [], cleared: [] }

export async function syncNow(): Promise<Delta> {
  const [track, fix, thresholds] = await Promise.all([
    get('track'),
    get('fix'),
    get('thresholds')
  ])
  if (!track) return EMPTY

  const now = Date.now()
  const anchorMs = startAnchorMs(track.waypoints, fix, track.startAt, now)
  const currentSeq = estimatePosition(track.waypoints, fix, track.startAt, now)
  const remaining = track.waypoints.filter((w) => w.seq >= currentSeq)
  if (remaining.length === 0) {
    await set('forecast', null)
    return EMPTY
  }

  try {
    const finishMs = anchorMs + remaining[remaining.length - 1].etaOffsetS * 1000
    const days = Math.min(16, Math.max(1, Math.ceil((finishMs - now) / 86400_000) + 1))
    const waypoints = await fetchOpenMeteo(remaining, days)

    // MET is a display-only cross-check, never a gate: rejections are ignored.
    const checkpoints = [...new Set([0, Math.floor(remaining.length / 2), remaining.length - 1])]
    const metResults = await Promise.allSettled(
      checkpoints.map((i) => fetchMet(remaining[i].lat, remaining[i].lon))
    )
    const met: Record<number, Hour[]> = {}
    const metExtras: Record<number, MetExtras> = {}
    metResults.forEach((r, i) => {
      if (r.status !== 'fulfilled') return
      const seq = remaining[checkpoints[i]].seq
      met[seq] = r.value.hours
      metExtras[seq] = { thunderByHour: r.value.thunderByHour }
    })

    // Fire danger: one keyless call for 60 days of spin-up plus the forecast.
    // Treated like MET, a cross-check that must never gate the sync.
    const fwiByDate: Record<string, number> = {}
    try {
      const mid = remaining[Math.floor(remaining.length / 2)]
      const inputs = await fetchFwiInputs(mid.lat, mid.lon, days)
      // runFwi preserves input order, so zip back by index.
      const run = runFwi(inputs, mid.lat)
      inputs.forEach((day, i) => {
        fwiByDate[new Date(day.t).toISOString().slice(0, 10)] = run[i].fwi
      })
    } catch {
      // No fire data this sync; every other warning still stands.
    }

    /*
     * Forecast lightning, which is an ignition risk rather than a storm
     * warning: see ./lightning for why it is not folded into `thunderstorm`.
     * Like the FWI it must never gate the sync, so a failure leaves every
     * other warning standing.
     *
     * Days the service could not answer for keep their previous reading rather
     * than falling out. Dropping them would delete the warning they raised,
     * and `diffWarnings` reads a warning that disappeared as one that cleared:
     * a dropped connection would tell the hiker by push that the lightning
     * risk had lifted. A stale reading is a worse forecast; a false all-clear
     * is a different and much worse kind of wrong.
     */
    const lightningByDate: Record<string, number> = {
      ...((await get('forecast'))?.lightningByDate ?? {})
    }
    for (const day of await fetchLightning(remaining, days, now)) {
      lightningByDate[day.date] = day.flashesPerKm2
    }
    // Yesterday's readings are not this walk's, and nothing prunes them
    // otherwise: the map is keyed by date and would grow without bound.
    const today = new Date(now).toISOString().slice(0, 10)
    for (const date of Object.keys(lightningByDate)) {
      if (date < today) delete lightningByDate[date]
    }

    // Official bulletin, never computed and never a `Warning`: it is regional,
    // and unlike every weather condition its absence is not an all-clear. It
    // must not gate the sync, but a failure here still has to reach the screen
    // as an explicit "unknown", which is what fetchBulletin's states carry.
    const avalanche = await fetchBulletin(remaining)

    // Fires already burning, which the FWI cannot tell you: it forecasts how
    // readily one would spread, not whether one exists. Also never a `Warning`,
    // because a satellite that has not passed overhead is not an all-clear.
    // fetchWildfires resolves rather than throws, so it cannot gate the sync.
    const wildfires = await fetchWildfires(remaining, now)

    const next = evaluateWarnings(
      thresholds,
      waypoints,
      track.waypoints,
      currentSeq,
      anchorMs,
      metExtras,
      fwiByDate,
      lightningByDate
    )
    // Fetching takes seconds, and the track can be replaced meanwhile. Writing
    // this forecast onto a different track would attribute one hike's warnings
    // to another, so a switch mid-flight discards the result instead.
    const current = await get('track')
    // startAt too, not just identity: changing the planned start re-runs this,
    // and two runs can land out of order and store the older answer.
    if (!current || current.addedAt !== track.addedAt || current.startAt !== track.startAt) {
      return EMPTY
    }

    // Scoped to the same window `next` was evaluated over: a warning that fell
    // behind the hiker left because they walked, not because the weather
    // changed, and reporting that as cleared is a false all-clear.
    const prev = ((await get('forecast'))?.warnings ?? []).filter((w) => w.seq >= currentSeq)
    const delta = diffWarnings(prev, next)

    await set('forecast', {
      fetchedAt: Date.now(),
      currentSeq,
      waypoints,
      met,
      fwiByDate,
      lightningByDate,
      warnings: next,
      avalanche,
      wildfires
    })
    await set('lastFetchError', null)
    return delta
  } catch (e) {
    // The previous forecast stays: a failed fetch must not blank the screen.
    await set('lastFetchError', {
      at: Date.now(),
      message: e instanceof Error ? e.message : String(e)
    })
    throw e
  }
}
