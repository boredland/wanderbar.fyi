/**
 * Distance between a route and a mapped area, in metres.
 *
 * Written for burnt-area perimeters, which unlike a hotspot have extent: a
 * fire's footprint can be kilometres across and the route can run beside it,
 * touch it, or pass straight through it. "Distance to the centre" would be
 * meaningless for those, so everything here measures to the nearest edge and
 * reports zero when the route is inside.
 *
 * The maths is planar, not spherical. Each polygon is projected about its own
 * first vertex, so the scale error is smallest exactly where it matters, near
 * the polygon, where the minimum lives. It grows only for route points far
 * away, which cannot be the minimum anyway.
 */

/** GeoJSON vertex order: longitude first. */
export type LonLat = [number, number]

/** One polygon as GeoJSON writes it: outer ring first, then holes. */
export type Ring = LonLat[]

type Plane = { x: number; y: number }

/** Local tangent plane: the polygon's own origin and its latitude's scaling. */
type Ref = { lat: number; lon: number; cos: number }

const M_PER_DEG_LAT = 111_320

/**
 * Segment maths in metres, squared. Coordinates are metres from a local origin,
 * so a cross product of a few square millimetres is rounding noise rather than
 * a real crossing; exact `=== 0` would miss a route that clips a vertex and
 * report an intersection as an infinitesimal gap.
 */
const EPS = 1e-6

/**
 * Longitude difference the short way round.
 *
 * Without this a route at 179.9 E and a fire at 179.9 W read as 40 000 km
 * apart instead of 20 km, so a fire the walk runs into would be discarded as
 * the most distant thing on Earth.
 */
const lonDelta = (lon: number, refLon: number): number =>
  ((((lon - refLon) % 360) + 540) % 360) - 180

/**
 * Offsets are measured from the reference point rather than from the meridian
 * and equator, so coordinates stay small near the polygon instead of carrying
 * the ~10^7 m of an absolute easting through every subtraction.
 */
const project = (p: { lat: number; lon: number }, ref: Ref): Plane => ({
  x: lonDelta(p.lon, ref.lon) * M_PER_DEG_LAT * ref.cos,
  y: (p.lat - ref.lat) * M_PER_DEG_LAT
})

const projectRing = (ring: Ring, ref: Ref): Plane[] =>
  ring.map(([lon, lat]) => project({ lat, lon }, ref))

/**
 * Even-odd ray casting over every ring at once.
 *
 * Counting crossings across outer ring and holes together is what makes holes
 * work without special-casing them: a point in a hole crosses the outer ring
 * once and the hole once, so it comes out even, which is to say outside.
 */
function inside(p: Plane, rings: Plane[][]): boolean {
  let odd = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        odd = !odd
      }
    }
  }
  return odd
}

function pointSegDistSq(p: Plane, a: Plane, b: Plane): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  // A zero-length segment is a vertex; falling through would divide by zero.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const ex = a.x + t * dx - p.x
  const ey = a.y + t * dy - p.y
  return ex * ex + ey * ey
}

const cross = (o: Plane, a: Plane, b: Plane): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Proper crossing or a collinear touch; either means the segments meet. */
function segmentsMeet(a: Plane, b: Plane, c: Plane, d: Plane): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  const on = (p: Plane, q: Plane, r: Plane) =>
    Math.min(p.x, q.x) <= r.x &&
    r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y &&
    r.y <= Math.max(p.y, q.y)
  return (
    (Math.abs(d1) < EPS && on(c, d, a)) ||
    (Math.abs(d2) < EPS && on(c, d, b)) ||
    (Math.abs(d3) < EPS && on(a, b, c)) ||
    (Math.abs(d4) < EPS && on(a, b, d))
  )
}

function segSegDistSq(a: Plane, b: Plane, c: Plane, d: Plane): number {
  if (segmentsMeet(a, b, c, d)) return 0
  return Math.min(
    pointSegDistSq(a, c, d),
    pointSegDistSq(b, c, d),
    pointSegDistSq(c, a, b),
    pointSegDistSq(d, a, b)
  )
}

/**
 * Metres from the route to the nearest edge of the nearest polygon, and whether
 * the route enters one.
 *
 * The distance is zero rather than negative when the route is inside an area:
 * how far in it goes is not a fact a burn outline can support, and a signed
 * distance invites reading it as depth.
 *
 * Segment pairs are walked rather than vertices, so a fire edge that passes
 * between two waypoints is caught from the edge's side as well as the route's.
 * That matters here: waypoints are up to 2 km apart, and a perimeter can sit
 * entirely between two of them.
 */
export function routeToRingsM(
  route: { lat: number; lon: number }[],
  polygons: Ring[][]
): { distanceM: number; inside: boolean } {
  if (route.length === 0 || polygons.length === 0) {
    return { distanceM: Infinity, inside: false }
  }

  let best = Infinity
  let inAny = false
  for (const polygon of polygons) {
    const outer = polygon[0]
    if (!outer || outer.length === 0) continue
    const ref: Ref = {
      lat: outer[0][1],
      lon: outer[0][0],
      cos: Math.cos((outer[0][1] * Math.PI) / 180)
    }
    const rings = polygon.map((r) => projectRing(r, ref))
    const pts = route.map((p) => project(p, ref))

    /*
     * Bounding boxes first. Most polygons in a response are nowhere near the
     * route, and rejecting one costs four comparisons where measuring it costs
     * every waypoint against every edge. `best` shrinks as nearer polygons are
     * found, so this prunes harder the further through the list it gets.
     */
    if (!inAny && best < Infinity && boxGapSq(pts, rings[0]) > best) continue

    let hit = false
    for (const p of pts) {
      if (inside(p, rings)) {
        hit = true
        break
      }
    }

    if (!hit) {
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length && !hit; j = i++) {
          // A single-point route has no segment, so measure to the edge directly.
          if (pts.length === 1) {
            const d = pointSegDistSq(pts[0], ring[j], ring[i])
            // On the edge is in it: a perimeter is not a safe place to stand.
            if (d <= EPS) hit = true
            else if (d < best) best = d
            continue
          }
          for (let k = 1; k < pts.length; k++) {
            const d = segSegDistSq(pts[k - 1], pts[k], ring[j], ring[i])
            // A crossing means the route enters the area between two waypoints,
            // which no vertex test above would have caught.
            if (d <= EPS) {
              hit = true
              break
            }
            if (d < best) best = d
          }
        }
      }
    }

    if (hit) {
      inAny = true
      best = 0
    }
  }

  if (inAny) return { distanceM: 0, inside: true }
  return { distanceM: best === Infinity ? Infinity : Math.sqrt(best), inside: false }
}

/**
 * Squared gap between the route's bounding box and a ring's, zero when they
 * overlap. A cheap lower bound on the true distance: if this already exceeds
 * the best found so far, no edge of that ring can beat it.
 */
function boxGapSq(pts: Plane[], ring: Plane[] | undefined): number {
  if (!ring || ring.length === 0) return 0
  let rMinX = Infinity
  let rMinY = Infinity
  let rMaxX = -Infinity
  let rMaxY = -Infinity
  for (const p of ring) {
    if (p.x < rMinX) rMinX = p.x
    if (p.x > rMaxX) rMaxX = p.x
    if (p.y < rMinY) rMinY = p.y
    if (p.y > rMaxY) rMaxY = p.y
  }
  let pMinX = Infinity
  let pMinY = Infinity
  let pMaxX = -Infinity
  let pMaxY = -Infinity
  for (const p of pts) {
    if (p.x < pMinX) pMinX = p.x
    if (p.x > pMaxX) pMaxX = p.x
    if (p.y < pMinY) pMinY = p.y
    if (p.y > pMaxY) pMaxY = p.y
  }
  const dx = Math.max(0, Math.max(rMinX - pMaxX, pMinX - rMaxX))
  const dy = Math.max(0, Math.max(rMinY - pMaxY, pMinY - rMaxY))
  return dx * dx + dy * dy
}

/**
 * GeoJSON serves either a Polygon or a MultiPolygon; the caller should not have
 * to care which. Anything else, including a null geometry, yields nothing, so a
 * malformed feature is dropped rather than measured as if it were at 0°N 0°E.
 */
export function ringsOf(geometry: unknown): Ring[][] {
  const g = geometry as { type?: unknown; coordinates?: unknown } | null | undefined
  if (!g || typeof g.type !== 'string' || !Array.isArray(g.coordinates)) return []

  const ring = (v: unknown): Ring | null => {
    if (!Array.isArray(v)) return null
    const out: Ring = []
    for (const pt of v) {
      if (!Array.isArray(pt) || pt.length < 2) return null
      const [lon, lat] = pt
      if (typeof lon !== 'number' || typeof lat !== 'number') return null
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
      out.push([lon, lat])
    }
    return out.length > 0 ? out : null
  }

  const polygon = (v: unknown): Ring[] | null => {
    if (!Array.isArray(v)) return null
    const rings: Ring[] = []
    for (const r of v) {
      const parsed = ring(r)
      if (!parsed) return null
      rings.push(parsed)
    }
    return rings.length > 0 ? rings : null
  }

  if (g.type === 'Polygon') {
    const p = polygon(g.coordinates)
    return p ? [p] : []
  }
  if (g.type === 'MultiPolygon') {
    const out: Ring[][] = []
    for (const p of g.coordinates) {
      const parsed = polygon(p)
      if (parsed) out.push(parsed)
    }
    return out
  }
  return []
}
