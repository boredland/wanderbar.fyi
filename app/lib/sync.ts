import { fetchBulletin } from './avalanche'
import { runFwi } from './fwi'
import { fetchFireRanking } from './fire-ranking'
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

    /*
     * Fire danger and its climatology are both regional daily figures, so both
     * are sampled at one point rather than per waypoint. The midpoint, so a
     * long route is described by its middle rather than by whichever end the
     * hiker happens to be standing at.
     */
    const mid = remaining[Math.floor(remaining.length / 2)]

    /*
     * Readings are kept per date and carried across syncs, so yesterday's have
     * to be dropped or the maps grow for as long as the track is loaded.
     */
    const today = new Date(now).toISOString().slice(0, 10)
    const previous = await get('forecast')

    // Fire danger: one keyless call for 60 days of spin-up plus the forecast.
    // Treated like MET, a cross-check that must never gate the sync.
    const fwiByDate: Record<string, number> = {}
    try {
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
    const lightningByDate: Record<string, number> = { ...(previous?.lightningByDate ?? {}) }
    for (const day of await fetchLightning(remaining, days, now)) {
      lightningByDate[day.date] = day.flashesPerKm2
    }
    for (const date of Object.keys(lightningByDate)) {
      if (date < today) delete lightningByDate[date]
    }

    /*
     * How unusual the fire weather is for this place and season: context for
     * the fire warning rather than a warning of its own, so it can never raise
     * or suppress one. Carried across syncs like the lightning readings, though
     * for a smaller reason. A missing percentile here cannot produce a false
     * all-clear, because the class and the index are computed on the device and
     * stand without it; it would only make the extra clause flicker on and off
     * between syncs, which reads as the record itself changing.
     */
    const rankingByDate: Record<string, number> = { ...(previous?.rankingByDate ?? {}) }
    try {
      for (const day of await fetchFireRanking(mid.lat, mid.lon, days, now)) {
        rankingByDate[day.date] = day.percentile
      }
    } catch {
      // Context only; the class and the index stand without it.
    }
    for (const date of Object.keys(rankingByDate)) {
      if (date < today) delete rankingByDate[date]
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
      lightningByDate,
      rankingByDate
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
      rankingByDate,
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
