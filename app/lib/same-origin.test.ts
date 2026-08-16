import { describe, expect, it } from 'vitest'
import { isSameOrigin } from './same-origin'

/**
 * One shared Durable Object row and one pending alarm, so a cross-site DELETE
 * ends every future wake for the reader with no error shown. These pin which
 * requests are allowed to change it.
 */

const req = (headers: Record<string, string>) =>
  new Request('https://wanderbar.fyi/api/wake', { method: 'DELETE', headers })

describe('requests from our own page', () => {
  it('accepts same-origin Fetch Metadata', () => {
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
  })

  it('accepts a matching Origin when the browser sends no Fetch Metadata', () => {
    expect(isSameOrigin(req({ origin: 'https://wanderbar.fyi' }))).toBe(true)
  })

  it('follows the deployment it is actually served from', () => {
    // Hardcoding the production host would break wrangler dev and previews.
    const local = new Request('http://127.0.0.1:8787/api/wake', {
      method: 'DELETE',
      headers: { origin: 'http://127.0.0.1:8787' }
    })
    expect(isSameOrigin(local)).toBe(true)
  })
})

describe('requests from anywhere else', () => {
  it('rejects a cross-site request', () => {
    expect(isSameOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('rejects a sibling subdomain', () => {
    // same-site is not same-origin, and the subscription is origin-bound.
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-site' }))).toBe(false)
    expect(isSameOrigin(req({ origin: 'https://evil.wanderbar.fyi' }))).toBe(false)
  })

  it('prefers Fetch Metadata over a forgeable Origin', () => {
    expect(
      isSameOrigin(
        req({ 'sec-fetch-site': 'cross-site', origin: 'https://wanderbar.fyi' })
      )
    ).toBe(false)
  })

  it('rejects a mismatched Origin', () => {
    expect(isSameOrigin(req({ origin: 'https://attacker.test' }))).toBe(false)
  })

  it('rejects a request carrying neither header', () => {
    expect(isSameOrigin(req({}))).toBe(false)
  })
})
