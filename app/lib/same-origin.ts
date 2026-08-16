/**
 * Whether a state-changing request came from wanderbar's own page.
 *
 * There are no accounts here, and the Durable Object is addressed by a fixed
 * name, so one row and one pending alarm are shared by the whole deployment.
 * That makes an unguarded cross-site `DELETE /api/wake` enough to end every
 * future wake for the reader, silently. Refusing requests that did not come
 * from our own page is the proportionate answer, short of inventing a session
 * this app deliberately does not have.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be forged by page script,
 * which is why it decides when present. `Origin` is the fallback for clients
 * that do not send Fetch Metadata, and is the weaker of the two.
 *
 * The expected origin comes from the request itself: hardcoding the production
 * host would break `wrangler dev` and every preview deployment.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  // 'same-site' is deliberately rejected: a sibling subdomain is not this
  // origin, and the push subscription it would rewrite is origin-bound.
  if (site) return site === 'same-origin'

  const origin = req.headers.get('origin')
  if (origin) return origin === new URL(req.url).origin

  // Neither header: nothing attributes this to our own page.
  return false
}
