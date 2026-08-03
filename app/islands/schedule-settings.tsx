import { useCallback, useEffect, useState } from 'hono/jsx'
import { requestPermission } from '../lib/notify'
import { DEFAULT_SCHEDULE, type Schedule } from '../lib/schedule'
import { get, set } from '../lib/store'

const INTERVALS = [1, 2, 3, 4, 6, 8, 12]
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export default function ScheduleSettings(props: { vapidPublicKey: string }) {
  const [s, setS] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    get('schedule').then(setS)
    // The service worker reads this at pushsubscriptionchange time, which
    // avoids inlining the key at build time.
    set('vapidPublicKey', props.vapidPublicKey)
  }, [props.vapidPublicKey])

  const push = useCallback(async (next: Schedule) => {
    setS(next)
    await set('schedule', next)
    if (!next.enabled) {
      await fetch('/api/wake', { method: 'DELETE' })
      setStatus('Background checks are off.')
      dispatchEvent(new Event('wanderbar:changed'))
      return
    }
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (!existing) return
    const json = existing.toJSON()
    const res = await fetch('/api/wake', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: existing.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        intervalH: next.intervalH,
        startH: next.startH,
        endH: next.endH,
        tz: next.tz
      })
    })
    const body = (await res.json()) as { nextWakeMs?: number; error?: string }
    setStatus(
      body.nextWakeMs
        ? `Next check ${new Date(body.nextWakeMs).toLocaleString()}.`
        : 'Could not save that schedule.'
    )
    dispatchEvent(new Event('wanderbar:changed'))
  }, [])

  // Permission must be requested from the click itself.
  const enable = async () => {
    setBusy(true)
    try {
      const permission = await requestPermission()
      if (permission !== 'granted') {
        setStatus('Notifications are blocked for this site.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(props.vapidPublicKey)
        }))
      const json = sub.toJSON()
      const next = { ...s, enabled: true }
      setS(next)
      await set('schedule', next)
      const res = await fetch('/api/wake', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          intervalH: next.intervalH,
          startH: next.startH,
          endH: next.endH,
          tz: next.tz
        })
      })
      const body = (await res.json()) as { nextWakeMs?: number }
      setStatus(
        body.nextWakeMs
          ? `Next check ${new Date(body.nextWakeMs).toLocaleString()}.`
          : 'Could not save that schedule.'
      )
      dispatchEvent(new Event('wanderbar:changed'))
    } finally {
      setBusy(false)
    }
  }

  const invalid = s.startH >= s.endH

  return (
    <div class="flex flex-col gap-3">
      <label class="check-row">
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => push({ ...s, enabled: (e.target as HTMLInputElement).checked })}
        />
        <span class="text-base">Check in the background</span>
      </label>

      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">Every</span>
        <select
          class="field figures"
          value={String(s.intervalH)}
          onChange={(e) => push({ ...s, intervalH: Number((e.target as HTMLSelectElement).value) })}
        >
          {INTERVALS.map((h) => (
            <option key={h} value={h} selected={h === s.intervalH}>
              {h} h
            </option>
          ))}
        </select>
      </label>

      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">From</span>
        <select
          class="field figures"
          value={String(s.startH)}
          onChange={(e) => push({ ...s, startH: Number((e.target as HTMLSelectElement).value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h} selected={h === s.startH}>
              {pad(h)}
            </option>
          ))}
        </select>
      </label>

      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">To</span>
        <select
          class="field figures"
          value={String(s.endH)}
          onChange={(e) => push({ ...s, endH: Number((e.target as HTMLSelectElement).value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h} selected={h === s.endH}>
              {pad(h)}
            </option>
          ))}
        </select>
      </label>

      {invalid ? (
        <p class="text-sm text-warn">
          The start hour must come before the end hour.
        </p>
      ) : null}

      <button
        type="button"
        class="btn"
        disabled={busy}
        onClick={enable}
      >
        {busy ? 'Enabling…' : 'Enable notifications'}
      </button>
      {status ? <p class="text-sm text-muted">{status}</p> : null}
    </div>
  )
}
