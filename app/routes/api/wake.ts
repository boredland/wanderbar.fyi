import { createRoute } from 'honox/factory'
import { isPushEndpoint } from '../../lib/push-endpoint'
import { isSameOrigin } from '../../lib/same-origin'
import type { WakerSave } from '../../waker'

/**
 * One Durable Object per push subscription, named by the endpoint.
 *
 * It used to be a single instance called 'solo', on the reading that there is
 * one track and therefore one subscription. That holds for one reader and
 * fails the moment two people use the deployment: the row is `id = 1`, so the
 * second subscriber's PUT overwrote the first's, and either one turning
 * notifications off deleted the only row there was. The first reader kept a
 * ticked box, an armed-looking schedule and no wakes, with nothing on screen
 * to say so.
 *
 * The endpoint is the subscription's own identity, already unique per device
 * and per browser profile, so it is what the instance is named after. Nothing
 * else changes: each instance still holds exactly one subscription and one
 * schedule, and still cannot compute a warning.
 *
 * Endpoints are opaque and long-lived, and `idFromName` hashes its argument, so
 * the name is not a place a secret ends up: it is the same string the alarm
 * already POSTs to.
 */
const stub = (env: Bindings, endpoint: string) =>
  env.WAKER.get(env.WAKER.idFromName(endpoint))

export const PUT = createRoute(async (c) => {
  if (!isSameOrigin(c.req.raw)) return c.json({ error: 'cross_origin' }, 403)
  let body: WakerSave
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }
  if (!isPushEndpoint(body?.endpoint)) return c.json({ error: 'bad_endpoint' }, 400)
  const res = await stub(c.env, body.endpoint).fetch('https://waker/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

export const DELETE = createRoute(async (c) => {
  // One shared row and one pending alarm, so a cross-site DELETE would end
  // every future wake for the reader without showing them an error.
  if (!isSameOrigin(c.req.raw)) return c.json({ error: 'cross_origin' }, 403)
  // The endpoint says whose schedule to stop. Without it this would have to
  // guess, and the guess it used to make was "everyone's".
  const endpoint = c.req.query('endpoint')
  if (!isPushEndpoint(endpoint)) return c.json({ error: 'bad_endpoint' }, 400)
  const res = await stub(c.env, endpoint).fetch('https://waker/', { method: 'DELETE' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
