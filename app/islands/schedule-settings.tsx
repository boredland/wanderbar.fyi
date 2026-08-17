import { useEffect, useState } from 'hono/jsx'
import { useLocale } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'
import { requestPermission } from '../lib/notify'
import { DEFAULT_SCHEDULE, type Schedule } from '../lib/schedule'
import { get, set } from '../lib/store'
import { currentEndpoint, stopWake } from '../lib/wake'

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

export default function ScheduleSettings(props: { vapidPublicKey: string; locale: Locale }) {
  const [locale, t] = useLocale(props.locale)
  const [s, setS] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    get('schedule').then(setS)
    // The service worker reads this at pushsubscriptionchange time, which
    // avoids inlining the key at build time.
    set('vapidPublicKey', props.vapidPublicKey)
  }, [props.vapidPublicKey])

  /**
   * Saves the schedule against a live push subscription, creating one if there
   * is none yet.
   *
   * Every caller is a click, which is what makes the permission prompt legal:
   * ticking the box used to store `enabled: true`, find no subscription and
   * return in silence, leaving a checked box that woke nothing.
   */
  const push = async (next: Schedule) => {
    setBusy(true)
    try {
      setS(next)
      await set('schedule', next)
      if (!next.enabled) {
        // Only when it was on. Adjusting an interval with notifications already
        // off is a local preference, and firing a DELETE for it would wake a
        // Durable Object per dropdown change to stop something already stopped.
        if (s.enabled) {
          // Name the subscription being stopped: the server keys one instance
          // per endpoint, so an unaddressed DELETE would either miss or, as it
          // once did, stop everyone's.
          await stopWake(await currentEndpoint())
        }
        setStatus(t('schedule.off'))
        dispatchEvent(new Event('wanderbar:changed'))
        return
      }

      const permission = await requestPermission()
      if (permission !== 'granted') {
        // Say so and put the box back: a schedule nothing can deliver is worse
        // than an off switch.
        const off = { ...next, enabled: false }
        setS(off)
        await set('schedule', off)
        setStatus(t('schedule.blocked'))
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
      const body = (await res.json()) as { nextWakeMs?: number; error?: string }
      setStatus(
        body.nextWakeMs
          ? t('schedule.nextCheck', { time: new Date(body.nextWakeMs).toLocaleString(locale) })
          : t('schedule.saveFailed')
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
          disabled={busy}
          onChange={(e) => push({ ...s, enabled: (e.target as HTMLInputElement).checked })}
        />
        <span class="text-base">{busy ? t('schedule.enabling') : t('schedule.enable')}</span>
      </label>

      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">{t('schedule.every')}</span>
        <select
          class="field figures"
          value={String(s.intervalH)}
          onChange={(e) => push({ ...s, intervalH: Number((e.target as HTMLSelectElement).value) })}
        >
          {INTERVALS.map((h) => (
            <option key={h} value={h} selected={h === s.intervalH}>
              {t('schedule.hours', { n: h })}
            </option>
          ))}
        </select>
      </label>

      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">{t('schedule.from')}</span>
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
        <span class="text-sm">{t('schedule.to')}</span>
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
        <p class="text-sm text-warn">{t('schedule.invalidRange')}</p>
      ) : null}

      {status ? <p class="text-sm text-muted">{status}</p> : null}
    </div>
  )
}
