import { createRoute } from 'honox/factory'
import { isPushEndpoint } from '../../lib/push-endpoint'
import { isSameOrigin } from '../../lib/same-origin'
import type { WakerSave } from '../../waker'

// One named instance: DO instances cannot be enumerated, and there is one track.
const stub = (env: Bindings) => env.WAKER.get(env.WAKER.idFromName('solo'))

export const PUT = createRoute(async (c) => {
  if (!isSameOrigin(c.req.raw)) return c.json({ error: 'cross_origin' }, 403)
  let body: WakerSave
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }
  if (!isPushEndpoint(body?.endpoint)) return c.json({ error: 'bad_endpoint' }, 400)
  const res = await stub(c.env).fetch('https://waker/', {
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
  const res = await stub(c.env).fetch('https://waker/', { method: 'DELETE' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
