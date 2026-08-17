/**
 * Stopping a wake schedule, from the page or from the service worker.
 *
 * The server keys one Durable Object per push endpoint, so stopping a schedule
 * means naming which subscription to stop. Three call sites need this — the off
 * switch, deleting the track a schedule belonged to, and a rotated subscription
 * retiring its old endpoint — and all three used to send a bare DELETE that
 * stopped whichever single instance existed, i.e. everyone's.
 */

/**
 * The endpoint of the subscription this device currently holds, or null.
 *
 * Every step is optional at runtime even where the types say otherwise:
 * `navigator.serviceWorker` is undefined in a private window and on an insecure
 * origin, and `ready` never settles when no worker is registered. The off
 * switch must work in all of those, so this resolves to null rather than
 * throwing or hanging, and the caller stops what it can.
 */
export async function currentEndpoint(timeoutMs = 3000): Promise<string | null> {
  try {
    const container = navigator.serviceWorker
    if (!container) return null
    const reg = await Promise.race([
      container.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ])
    if (!reg) return null
    const sub = await reg.pushManager.getSubscription()
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

/**
 * Silent on failure by design: every caller is already tearing down, and the
 * schedule is stored locally as disabled either way. A throw here would leave
 * the reader looking at an error about something they just switched off.
 *
 * A null endpoint means this device has no subscription to stop. There is then
 * no instance to address: one is only ever created by a PUT carrying an
 * endpoint, and the server refuses a DELETE that names none.
 */
export async function stopWake(endpoint: string | null): Promise<void> {
  if (!endpoint) return
  try {
    await fetch(`/api/wake?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
  } catch {
    // Offline, or the endpoint is already gone. The alarm dies with the
    // subscription on the next push either way: a 404 or 410 clears the row.
  }
}
