import { createRoute } from 'honox/factory'
import type { WakerSave } from '../../waker'

// One named instance: DO instances cannot be enumerated, and there is one track.
const stub = (env: Bindings) => env.WAKER.get(env.WAKER.idFromName('solo'))

export const GET = createRoute(async (c) => {
  const res = await stub(c.env).fetch('https://waker/', { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

export const PUT = createRoute(async (c) => {
  let body: WakerSave
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }
  const res = await stub(c.env).fetch('https://waker/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

export const DELETE = createRoute(async (c) => {
  const res = await stub(c.env).fetch('https://waker/', { method: 'DELETE' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
