import { useState } from 'hono/jsx'
import { notifyDelta } from '../lib/notify'
import { get, set } from '../lib/store'
import { syncNow } from '../lib/sync'
import { snapToTrack } from '../lib/track'

export default function PositionButton() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const locate = () => {
    setBusy(true)
    setMessage(null)
    // enableHighAccuracy is what engages GNSS.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const track = await get('track')
          if (!track) return
          const { latitude, longitude, accuracy, altitude } = pos.coords
          const snapped = snapToTrack(track.waypoints, latitude, longitude)
          await set('fix', {
            at: pos.timestamp,
            lat: latitude,
            lon: longitude,
            accuracyM: accuracy ?? null,
            // Diagnostics only: the datum differs per OS, so nothing reads it.
            rawAltitudeUnknownDatumM: altitude ?? null,
            snappedSeq: snapped.seq,
            snappedDistM: snapped.distM
          })
          if (track.startedAt === null) {
            await set('track', { ...track, startedAt: Date.now() })
          }
          if (snapped.distM > 5000) setMessage('You appear to be >5 km off this track.')
          const kmBySeq: Record<number, number> = {}
          for (const w of track.waypoints) kmBySeq[w.seq] = w.cumDistM / 1000
          try {
            await notifyDelta(await syncNow(), kmBySeq)
          } catch {
            // The freshness row surfaces the failure.
          }
          dispatchEvent(new Event('wanderbar:changed'))
        } finally {
          setBusy(false)
        }
      },
      () => {
        setBusy(false)
        setMessage('Position unavailable — using planned pace.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }

  return (
    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="min-h-[44px] rounded-[6px] border border-[--color-line] px-4 disabled:opacity-60"
        disabled={busy}
        onClick={locate}
      >
        {busy ? 'Locating…' : 'Update my position'}
      </button>
      {message ? <p class="text-[14px] text-[--color-muted]">{message}</p> : null}
    </div>
  )
}
