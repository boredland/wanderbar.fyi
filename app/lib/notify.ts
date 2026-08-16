import { get } from './store'
import { clockAt, detailText, plural, translator, type MessageKey, type T } from './i18n'
import { DEFAULT_LOCALE, type Locale } from './i18n/locale'
import type { Delta, Warning } from './warnings'

const TAG = 'wanderbar-wx'

/** Must be called from a user gesture; iOS also needs Add to Home Screen. */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in globalThis)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/**
 * The registration that can show a notification, from either side.
 *
 * `navigator.serviceWorker` does not exist on a WorkerNavigator, so reading
 * `.ready` from the service worker throws — which is the one place a background
 * push has to produce a notification.
 */
function registration(): Promise<ServiceWorkerRegistration> {
  if ('serviceWorker' in navigator) return navigator.serviceWorker.ready
  return Promise.resolve((self as unknown as ServiceWorkerGlobalScope).registration)
}

function line(t: T, locale: Locale, w: Warning, kmBySeq: Record<number, number>): string {
  const km = kmBySeq[w.seq]
  const where =
    km === undefined
      ? t('notify.atPoint', { seq: w.seq })
      : t('notify.atKm', { km: km.toFixed(1) })
  const label = t(`condition.${w.condition}` as MessageKey)
  return `${clockAt(locale, w.forecastHour)} ${where}: ${label} (${detailText(t, locale, w.detail)})`
}

/**
 * Dismisses any warning notification still on screen. Called when the track
 * changes: a lock-screen warning naming a hill you are no longer walking is
 * worse than no warning, and the tag alone only replaces on the *next* notify.
 */
export async function clearNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return
    for (const n of await reg.getNotifications({ tag: TAG })) n.close()
  } catch {
    // Not supported everywhere; a stale notification is not worth throwing over.
  }
}

export async function notifyDelta(
  delta: Delta,
  kmBySeq: Record<number, number> = {}
): Promise<void> {
  // No change is the common case and the entire point of the diff.
  if (delta.worsened.length === 0 && delta.cleared.length === 0) return
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return

  const reg = await registration()

  // Read from IndexedDB rather than taken as an argument: this also runs from
  // the service worker on a background push, where there is no page to ask.
  const locale = (await get('locale')) ?? DEFAULT_LOCALE
  const t = translator(locale)

  let title: string
  const body: string[] = []
  if (delta.worsened.length > 0) {
    title = t('notify.worsened')
    for (const w of delta.worsened.slice(0, 3)) body.push(line(t, locale, w, kmBySeq))
    if (delta.worsened.length > 3) body.push(t('notify.more', { n: delta.worsened.length - 3 }))
    if (delta.cleared.length > 0) {
      body.push(plural(t, locale, 'notify.lifted', delta.cleared.length))
    }
  } else {
    title = t('notify.clearing')
    for (const w of delta.cleared.slice(0, 3)) body.push(line(t, locale, w, kmBySeq))
    if (delta.cleared.length > 3) body.push(t('notify.more', { n: delta.cleared.length - 3 }))
  }

  // One fixed tag so a newer notification replaces rather than stacks.
  await reg.showNotification(title, {
    body: body.join('\n'),
    tag: TAG,
    icon: '/icon-192.png'
  })
}
