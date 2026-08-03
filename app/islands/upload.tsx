import { useState } from 'hono/jsx'
import { ingestGpx } from '../lib/ingest'
import { get } from '../lib/store'
import { PROFILES, type ProfileId } from '../lib/track'

/** Whole-hour slots over Open-Meteo's 16-day range; see StartRow in track-view. */
function startOptions(now: number) {
  const out = [{ value: '', label: 'Now' }]
  const first = new Date(now)
  first.setMinutes(0, 0, 0)
  first.setHours(first.getHours() + 1)
  for (let i = 0; i < 16 * 24; i++) {
    const t = new Date(first.getTime() + i * 3600_000)
    const days = Math.round(
      (new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400_000
    )
    const day =
      days === 0
        ? 'Today'
        : days === 1
          ? 'Tomorrow'
          : t.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
    out.push({
      value: String(t.getTime()),
      label: `${day} ${String(t.getHours()).padStart(2, '0')}:00`
    })
  }
  return out
}

export default function Upload(props: { shareError?: string }) {
  const [error, setError] = useState<string | null>(props.shareError ?? null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: Event) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const data = new FormData(form)
    const file = data.get('gpx')
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a .gpx file first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await ingestGpx({
        xml: await file.text(),
        name: String(data.get('name') ?? ''),
        fallbackName: file.name,
        profile: (String(data.get('profile')) as ProfileId) || 'hiking',
        startAt: data.get('startAt') ? Number(data.get('startAt')) : null
      })
      if (!result.ok) setError(result.error)
      else dispatchEvent(new Event('wanderbar:changed'))
    } catch {
      setError('Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={onSubmit}>
      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">GPX track</span>
        <input
          type="file"
          name="gpx"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          class="field py-2"
          required
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">Name (optional)</span>
        <input
          type="text"
          name="name"
          class="field"
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">Start</span>
        <select
          name="startAt"
          class="field figures"
        >
          {startOptions(Date.now()).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-[14px] text-muted">Pace profile</span>
        <select
          name="profile"
          class="field"
        >
          {(Object.keys(PROFILES) as ProfileId[]).map((id) => (
            <option key={id} value={id}>
              {PROFILES[id].label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        class="btn btn-primary"
        disabled={busy}
      >
        {busy ? 'Adding…' : 'Add track'}
      </button>
      {error ? <p class="text-[14px] text-warn">{error}</p> : null}
    </form>
  )
}
