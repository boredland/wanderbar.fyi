import { get, set } from './store'
import { estimatePosition, startAnchorMs } from './track'
import { diffWarnings, evaluateWarnings, type Delta, type MetExtras } from './warnings'
import { fetchMet, fetchOpenMeteo, type Hour } from './weather'

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
    const metSymbols: Record<number, string | null> = {}
    const metThunder: Record<number, number | null> = {}
    const metExtras: Record<number, MetExtras> = {}
    metResults.forEach((r, i) => {
      if (r.status !== 'fulfilled') return
      const seq = remaining[checkpoints[i]].seq
      met[seq] = r.value.hours
      metSymbols[seq] = r.value.symbolCode
      metThunder[seq] = r.value.probabilityOfThunder
      metExtras[seq] = { probabilityOfThunder: r.value.probabilityOfThunder }
    })

    const next = evaluateWarnings(
      thresholds,
      waypoints,
      track.waypoints,
      currentSeq,
      anchorMs,
      metExtras
    )
    const prev = (await get('forecast'))?.warnings ?? []
    const delta = diffWarnings(prev, next)

    await set('forecast', {
      fetchedAt: Date.now(),
      currentSeq,
      waypoints,
      met,
      metSymbols,
      metThunder,
      warnings: next
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
