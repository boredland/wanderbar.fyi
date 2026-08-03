import { conditionLabel } from './icons'
import type { Delta, Warning } from './warnings'

const TAG = 'wanderbar-wx'

/** Must be called from a user gesture; iOS also needs Add to Home Screen. */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in globalThis)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function line(w: Warning, kmBySeq: Record<number, number>): string {
  const km = kmBySeq[w.seq]
  const where = km === undefined ? `point ${w.seq}` : `km ${km.toFixed(1)}`
  return `${clock(w.forecastHour)} ${where}: ${conditionLabel[w.condition]} (${w.detail})`
}

export async function notifyDelta(
  delta: Delta,
  kmBySeq: Record<number, number> = {}
): Promise<void> {
  // No change is the common case and the entire point of the diff.
  if (delta.worsened.length === 0 && delta.cleared.length === 0) return
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return

  const reg = await navigator.serviceWorker.ready

  let title: string
  const body: string[] = []
  if (delta.worsened.length > 0) {
    title = 'Un-wanderbar weather ahead'
    for (const w of delta.worsened.slice(0, 3)) body.push(line(w, kmBySeq))
    if (delta.worsened.length > 3) body.push(`+${delta.worsened.length - 3} more`)
    if (delta.cleared.length > 0) body.push(`… and ${delta.cleared.length} warnings lifted`)
  } else {
    title = 'Weather is clearing'
    for (const w of delta.cleared.slice(0, 3)) body.push(line(w, kmBySeq))
    if (delta.cleared.length > 3) body.push(`+${delta.cleared.length - 3} more`)
  }

  // One fixed tag so a newer notification replaces rather than stacks.
  await reg.showNotification(title, {
    body: body.join('\n'),
    tag: TAG,
    icon: '/icon-192.png'
  })
}
