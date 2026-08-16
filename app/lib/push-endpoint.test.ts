import { describe, expect, it } from 'vitest'
import { isPushEndpoint } from './push-endpoint'

/**
 * The alarm signs a VAPID header and POSTs it to whatever this accepts, and the
 * route that stores it is public. So the interesting cases here are the
 * rejections: anything that is not a push service must not reach `fetch`.
 */

describe('endpoints a real subscription produces', () => {
  it('accepts the four browser push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/QRSTUV')).toBe(true)
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true)
  })

  it('accepts the legacy GCM host Chrome still hands out', () => {
    expect(isPushEndpoint('https://android.googleapis.com/gcm/send/abc')).toBe(true)
  })

  it('accepts a subdomain of a push service', () => {
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=a')).toBe(true)
  })
})

describe('endpoints that must never be stored', () => {
  it('rejects a host that merely ends with a push service name', () => {
    // The classic bypass: a suffix match with no dot boundary lets this pass.
    expect(isPushEndpoint('https://push.apple.com.attacker.test/x')).toBe(false)
    expect(isPushEndpoint('https://notfcm.googleapis.com.evil.test/x')).toBe(false)
    expect(isPushEndpoint('https://evilgoogleapis.com/x')).toBe(false)
  })

  it('rejects anything that is not HTTPS', () => {
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(isPushEndpoint('file:///etc/hostname')).toBe(false)
    expect(isPushEndpoint('data:text/plain,hello')).toBe(false)
  })

  it('rejects other Google services, which are not push gateways', () => {
    // A bare googleapis.com allowlist entry would let anyone with a bucket or a
    // Cloud Function receive the VAPID header the alarm signs.
    expect(isPushEndpoint('https://storage.googleapis.com/some-bucket/hook')).toBe(false)
    expect(isPushEndpoint('https://sheets.googleapis.com/v4/x')).toBe(false)
  })

  it('rejects a host nobody pushes from', () => {
    expect(isPushEndpoint('https://example.test/push')).toBe(false)
    expect(isPushEndpoint('https://127.0.0.1/push')).toBe(false)
    expect(isPushEndpoint('https://[::1]/push')).toBe(false)
  })

  it('rejects credentials in the URL, which would ride along with our header', () => {
    expect(isPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/abc')).toBe(false)
  })

  it('rejects what is not a URL at all', () => {
    expect(isPushEndpoint('')).toBe(false)
    expect(isPushEndpoint('not a url')).toBe(false)
    expect(isPushEndpoint('/fcm/send/abc')).toBe(false)
    expect(isPushEndpoint(null)).toBe(false)
    expect(isPushEndpoint(undefined)).toBe(false)
    expect(isPushEndpoint(42)).toBe(false)
    expect(isPushEndpoint({ endpoint: 'https://fcm.googleapis.com/x' })).toBe(false)
  })

  it('is not fooled by case in the hostname', () => {
    expect(isPushEndpoint('https://FCM.GOOGLEAPIS.COM/fcm/send/abc')).toBe(true)
    expect(isPushEndpoint('https://PUSH.APPLE.COM.attacker.test/x')).toBe(false)
  })
})
