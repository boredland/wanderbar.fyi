/**
 * A push subscription's endpoint is a URL this origin will later POST to, on a
 * schedule, carrying a VAPID `Authorization` header signed with our own key.
 * `PUT /api/wake` is public and unauthenticated, so whatever it stores is
 * whatever the Durable Object's alarm will sign for. That makes the endpoint
 * the one field worth checking properly: it must be a browser push service,
 * over HTTPS, and nothing else.
 *
 * The allowlist is the maintenance cost, and it is the point. A new push
 * service means a visible one-line edit here, which is cheaper than accepting
 * any URL a caller offers.
 */
const PUSH_HOSTS = [
  // Chrome and Chromium, via FCM. Named exactly: a bare `googleapis.com` would
  // also admit `storage.googleapis.com/<attacker-bucket>` and every other
  // Google service a stranger can put a URL on, and the alarm would POST our
  // signed VAPID header straight to it.
  'fcm.googleapis.com',
  'android.googleapis.com',
  // Firefox.
  'push.services.mozilla.com',
  // Safari, iOS and macOS.
  'push.apple.com',
  // Edge and Windows.
  'notify.windows.com'
]

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  // Credentials in the URL would be sent along with our signed header.
  if (url.username !== '' || url.password !== '') return false

  // Anchored on a dot so a lookalike ending in the same characters cannot pass:
  // `push.apple.com.attacker.test` is not a subdomain of `push.apple.com`, and
  // a bare `endsWith` would wave it through.
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}
