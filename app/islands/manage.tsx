import { useCallback, useEffect, useState } from 'hono/jsx'
import { clearNotifications, notifyDelta } from '../lib/notify'
import { clearTrack, get, set, type Track } from '../lib/store'
import { syncNow } from '../lib/sync'
import {
  applyPace,
  PROFILES,
  resample,
  REST_FACTORS,
  type ProfileId,
  type RestId
} from '../lib/track'
import { parseGpx } from '../lib/gpx'

const changed = () => dispatchEvent(new Event('wanderbar:changed'))


export default function Manage() {
  const [track, setTrack] = useState<Track | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const t = await get('track')
    setTrack(t)
    setName(t?.name ?? '')
  }, [])

  useEffect(() => {
    reload()
    addEventListener('wanderbar:changed', reload)
    return () => removeEventListener('wanderbar:changed', reload)
  }, [reload])

  if (!track) return null

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await set('track', { ...track, name: trimmed.slice(0, 120), nameSource: 'user' })
    await reload()
    changed()
  }

  const rederive = async (profile: ProfileId, rest: RestId) => {
    setBusy(true)
    try {
      // Re-derive from the stored GPX so every ETA reflects the new pace, and
      // resync: changed ETAs legitimately move the ±1 h warning windows.
      const { points } = parseGpx(track.gpxText)
      let wps = resample(points)
      if (track.eleSource !== 'gpx') {
        const byIdx = track.waypoints
        wps = wps.map((w, i) => ({ ...w, eleM: byIdx[i]?.eleM ?? null, cumAscentM: byIdx[i]?.cumAscentM ?? 0 }))
      }
      const waypoints = applyPace(wps, profile, rest)
      const last = waypoints[waypoints.length - 1]
      await set('track', {
        ...track,
        profile,
        rest,
        waypoints,
        lengthM: last.cumDistM,
        ascentM: last.cumAscentM
      })
      const kmBySeq: Record<number, number> = {}
      for (const w of waypoints) kmBySeq[w.seq] = w.cumDistM / 1000
      try {
        await notifyDelta(await syncNow(), kmBySeq)
      } catch {
        // lastFetchError is rendered by the freshness row.
      }
      await reload()
      changed()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete “${track.name}”?`)) return
    await clearTrack()
    await clearNotifications()
    // A schedule with no track would wake the app to sync nothing.
    await fetch('/api/wake', { method: 'DELETE' })
    const schedule = await get('schedule')
    await set('schedule', { ...schedule, enabled: false })
    await reload()
    changed()
  }


  return (
    <div class="flex flex-col gap-4">
      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">
          {track.nameSource === 'user' ? 'Name' : 'Name this hike'}
        </span>
        <div class="flex gap-2">
          <input
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            class="field flex-1"
          />
          <button
            type="button"
            class="btn"
            onClick={saveName}
          >
            Save
          </button>
        </div>
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">Pace profile</span>
        <select
          class="field"
          disabled={busy}
          value={track.profile}
          onChange={(e) =>
            rederive((e.target as HTMLSelectElement).value as ProfileId, track.rest)
          }
        >
          {(Object.keys(PROFILES) as ProfileId[]).map((id) => (
            <option key={id} value={id} selected={id === track.profile}>
              {PROFILES[id].label}
            </option>
          ))}
        </select>
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">Breaks</span>
        <select
          class="field"
          disabled={busy}
          value={track.rest}
          onChange={(e) =>
            rederive(track.profile, (e.target as HTMLSelectElement).value as RestId)
          }
        >
          {(Object.keys(REST_FACTORS) as RestId[]).map((id) => (
            <option key={id} value={id} selected={id === track.rest}>
              {REST_FACTORS[id].label}
            </option>
          ))}
        </select>
        <span class="text-[12px] text-muted">
          The pace standards count moving time only.
        </span>
      </label>

      <button
        type="button"
        class="btn btn-danger"
        onClick={remove}
      >
        Delete this track
      </button>
    </div>
  )
}
