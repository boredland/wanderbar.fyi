/// <reference lib="webworker" />
import { notifyDelta } from '../lib/notify'
import { get } from '../lib/store'
import { syncNow } from '../lib/sync'

declare const self: ServiceWorkerGlobalScope

// Inert by design: registered only so Chrome offers the install prompt.
// Caching here would serve stale forecasts and swallow the share POST.
self.addEventListener('fetch', () => {})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.openWindow('/'))
})

self.addEventListener('push', (e) => e.waitUntil(handleWake()))

self.addEventListener('pushsubscriptionchange', (e) =>
  (e as ExtendableEvent).waitUntil(resubscribe())
)

async function handleWake(): Promise<void> {
  // A push MUST end in a visible notification: Chrome otherwise shows
  // "This site has been updated in the background." and Safari may revoke
  // the subscription. We accept that fallback on no-change by design.
  try {
    const delta = await syncNow()
    const track = await get('track')
    const kmBySeq: Record<number, number> = {}
    for (const w of track?.waypoints ?? []) kmBySeq[w.seq] = w.cumDistM / 1000
    await notifyDelta(delta, kmBySeq)
  } catch {
    // Swallow: a failed fetch must not produce a misleading weather
    // notification. syncNow already recorded lastFetchError for the UI.
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function resubscribe(): Promise<void> {
  // The key is read from IndexedDB rather than inlined at build time, so the
  // worker needs no build-time substitution.
  const [key, schedule] = await Promise.all([get('vapidPublicKey'), get('schedule')])
  if (!key) return

  const sub = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  })
  const json = sub.toJSON()
  await fetch('/api/wake', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      intervalH: schedule.intervalH,
      startH: schedule.startH,
      endH: schedule.endH,
      tz: schedule.tz
    })
  })
}
