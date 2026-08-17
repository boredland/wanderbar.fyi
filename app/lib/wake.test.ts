import { afterEach, describe, expect, it, vi } from 'vitest'
import { stopWake } from './wake'

/**
 * Stopping a schedule has to name the subscription it is stopping. The server
 * keys one Durable Object per endpoint, and the bare DELETE this replaced
 * stopped the single shared instance — which is to say, everyone's.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stopWake', () => {
  it('names the endpoint it is stopping', async () => {
    const spy = vi.fn(() => Promise.resolve(new Response('{"ok":true}')))
    vi.stubGlobal('fetch', spy)

    await stopWake('https://fcm.googleapis.com/fcm/send/abc123')

    expect(spy).toHaveBeenCalledTimes(1)
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(url).toContain('endpoint=')
    // Percent-encoded, or the query stops at the endpoint's own slashes.
    expect(url).toContain(encodeURIComponent('https://fcm.googleapis.com/fcm/send/abc123'))
  })

  it('encodes an endpoint carrying characters that would split the query', async () => {
    const spy = vi.fn(() => Promise.resolve(new Response('{"ok":true}')))
    vi.stubGlobal('fetch', spy)

    await stopWake('https://fcm.googleapis.com/fcm/send/a?b=c&d=e')

    const [url] = spy.mock.calls[0] as unknown as [string]
    // Exactly one `?`: the endpoint's own must not start a second parameter.
    expect(url.split('?')).toHaveLength(2)
    expect(new URL(url, 'https://wanderbar.fyi').searchParams.get('endpoint')).toBe(
      'https://fcm.googleapis.com/fcm/send/a?b=c&d=e'
    )
  })

  it('stays quiet when the network is gone', async () => {
    // Both callers are tearing down and have already stored the schedule as
    // off; an error here would be about something the reader just switched off.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    await expect(stopWake('https://fcm.googleapis.com/fcm/send/abc')).resolves.toBeUndefined()
  })
})
