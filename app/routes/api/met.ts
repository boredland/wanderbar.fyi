import { createRoute } from 'honox/factory'

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete'

export const GET = createRoute(async (c) => {
  const lat = Number(c.req.query('lat'))
  const lon = Number(c.req.query('lon'))
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return c.json({ error: 'bad_lat' }, 400)
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return c.json({ error: 'bad_lon' }, 400)

  // MET's ToS requires an identifying User-Agent, which browsers cannot set.
  // Supplying it is this route's entire reason to exist.
  const upstream = await fetch(`${MET_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, {
    headers: { 'User-Agent': c.env.MET_USER_AGENT }
  })
  if (!upstream.ok) return c.json({ error: 'met_unavailable' }, 502)

  return new Response(upstream.body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=1800'
    }
  })
})
