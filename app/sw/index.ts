/// <reference lib="webworker" />
import { notifyDelta } from '../lib/notify'
import { get } from '../lib/store'
import { syncNow } from '../lib/sync'
import { PRECACHE } from './precache'

declare const self: ServiceWorkerGlobalScope

/*
 * Bump on any change to the caching rules below. `activate` deletes every cache
 * that is not this one, so an old shell cannot outlive the worker that wrote it.
 */
const CACHE = 'wanderbar-v1'

/**
 * The document, cached so the app can start without a network.
 *
 * The forecast itself has never come from HTTP — it lives in IndexedDB and is
 * stamped with `fetchedAt` — so caching the shell changes nothing about how old
 * the numbers are. It only decides whether the code that renders them, and
 * states their age, can run at all. Without this, a cold start on a col with no
 * signal is a browser error page while a complete forecast sits unreachable one
 * layer below.
 *
 * The bargain is that the app now looks alive offline, which is exactly why
 * `lib/freshness.ts` exists and why the offline path leads with an age notice
 * rather than a footnote.
 */
const SHELL = '/'

/** Immutable by construction: every one of these carries a content hash. */
const isHashedAsset = (p: string) => p.startsWith('/static/')

/**
 * Static by deployment rather than by hash. Weather icons and fonts are the
 * difference between an offline timeline that reads and one full of broken
 * images in a fallback font, and both are refreshed in the background.
 */
const isStaticAsset = (p: string) =>
  p.startsWith('/wx/') ||
  p.startsWith('/fonts/') ||
  p === '/manifest.webmanifest' ||
  p === '/icon.svg' ||
  p === '/favicon.ico' ||
  p === '/apple-touch-icon.png'

self.addEventListener('install', (e) => {
  /*
   * The whole graph up front, not just the shell.
   *
   * A worker does not control the page that registers it: it activates after
   * that page has already fetched its scripts, so on a first visit every
   * /static/* request goes around the fetch handler below and nothing but the
   * document would be stored. Someone who opens wanderbar once and walks out of
   * signal would then get the cached shell and no code to run it. Precaching is
   * the only thing that closes that window, and it is why the URL list is
   * generated from the build manifest rather than discovered at runtime.
   *
   * addAll is atomic: one 404 leaves the cache empty rather than half-filled,
   * which is the honest outcome, since a partial precache is exactly the
   * broken-offline state this exists to prevent.
   */
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([...PRECACHE]))
      .catch(() => {
        // Never block activation: the worker is still wanted for push, and the
        // runtime handlers below refill the cache on the next navigation.
      })
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // No skipWaiting: a page already open keeps the worker it loaded with,
      // so a deploy cannot swap the code under a hike in progress. The new
      // worker takes over on the next cold start.
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  // The share target is a POST of the user's GPX file and /api/* is live data
  // whose staleness the app cannot see. Neither may ever be served from cache.
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    e.respondWith(navigateWithFallback(req))
    return
  }
  if (isHashedAsset(url.pathname)) {
    e.respondWith(cacheFirst(req))
    return
  }
  if (isStaticAsset(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req))
  }
})

/**
 * Network first, cache only as the fallback.
 *
 * The document carries `VAPID_PUBLIC_KEY` and reads `?shareError`, so a cached
 * copy is a deploy-old, query-blind approximation. Online it is never used;
 * offline it is the whole point. The stored copy is keyed on the bare shell so
 * that any route falls back to the same document, which then re-reads the real
 * state from IndexedDB — including the key, which the app re-persists on mount.
 */
async function navigateWithFallback(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(SHELL, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(SHELL)
    if (hit) return hit
    throw err
  }
}

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

async function staleWhileRevalidate(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => hit ?? Response.error())
  return hit ?? fresh
}

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
