import { describe, expect, it } from 'vitest'
import { parseGpx } from './gpx'
import {
  applyPace,
  bboxOf,
  estimatePosition,
  haversineM,
  paceTime,
  resample,
  simplifyForMap,
  snapToTrack,
  type Pt,
  type Waypoint
} from './track'

const TWO_SEG_GPX = `<?xml version="1.0"?>
<gpx version="1.1"><trk><name>Two Seg</name>
<trkseg>
  <trkpt lat="47.4211" lon="10.9853"><ele>1200</ele><time>2026-08-03T08:00:00Z</time></trkpt>
  <trkpt lat="47.4225" lon="10.9871"><ele>1240</ele></trkpt>
</trkseg>
<trkseg>
  <trkpt lat="47.4240" lon="10.9890"><ele>1300</ele><time>2026-08-03T09:00:00Z</time></trkpt>
</trkseg>
</trk></gpx>`

const line = (n: number, eleAt: (i: number) => number | null): Pt[] =>
  Array.from({ length: n }, (_, i) => ({
    lat: 47.42 + i * 0.0009,
    lon: 10.98 + i * 0.0007,
    ele: eleAt(i),
    time: null
  }))

describe('parseGpx', () => {
  it('flattens segments and keeps missing time as null', () => {
    const { name, points, sparse } = parseGpx(TWO_SEG_GPX)
    expect(name).toBe('Two Seg')
    expect(sparse).toBe(false)
    expect(points).toHaveLength(3)
    expect(points[1].time).toBeNull()
    expect(points[0].time).toBe(Date.parse('2026-08-03T08:00:00Z'))
    expect(points[2].ele).toBe(1300)
  })

  it('flags a route-only file as sparse', () => {
    const { points, sparse } = parseGpx(
      '<?xml version="1.0"?><gpx version="1.1"><rte><rtept lat="47.42" lon="10.98"/><rtept lat="47.60" lon="11.20"/></rte></gpx>'
    )
    expect(sparse).toBe(true)
    expect(points).toHaveLength(2)
  })
})

describe('haversineM', () => {
  it('measures the Alps reference pair at 206.3 m', () => {
    // 155.67 m north + 135.42 m east, cross-checked against an independent
    // equirectangular computation. The plan's 217 m figure was wrong.
    const d = haversineM({ lat: 47.4211, lon: 10.9853 }, { lat: 47.4225, lon: 10.9871 })
    expect(Math.abs(d - 206.33)).toBeLessThan(1)
  })
})

describe('paceTime', () => {
  it('applies DIN 33466 max+half-min for hiking', () => {
    expect(paceTime('hiking', 4000, 300, 0)).toBe(5400)
  })

  it('applies SAC constants for mountain hiking', () => {
    expect(paceTime('mountain', 4000, 400, 0)).toBe(5400)
  })

  it('adds climb linearly and ignores descent for cycling', () => {
    expect(paceTime('cycling', 20000, 700, 500)).toBe(7200)
  })

  it('prices ski descent at 1200 m/h', () => {
    expect(paceTime('ski', 0, 0, 1200)).toBe(3600)
  })
})

describe('snapToTrack', () => {
  it('reports the perpendicular offset from the first segment', () => {
    const wps = resample(line(120, (i) => 1200 + i * 6))
    // ~50 m north of the start, perpendicular-ish to the track bearing.
    const { distM } = snapToTrack(wps, wps[0].lat + 0.00045, wps[0].lon)
    expect(distM).toBeGreaterThan(20)
    expect(distM).toBeLessThan(60)
  })
})

describe('estimatePosition', () => {
  const wps: Waypoint[] = [0, 3600, 7200].map((etaOffsetS, seq) => ({
    seq,
    lat: 0,
    lon: 0,
    eleM: null,
    cumDistM: seq * 1000,
    cumAscentM: 0,
    etaOffsetS
  }))

  it('dead-reckons forward from a 90-minute-old fix', () => {
    const now = 1_800_000_000_000
    expect(estimatePosition(wps, { at: now - 90 * 60_000, snappedSeq: 0 }, null, now)).toBe(1)
  })

  it('falls back to startedAt when there is no fix', () => {
    const now = 1_800_000_000_000
    expect(estimatePosition(wps, null, now - 2 * 3600_000, now)).toBe(2)
  })

  it('returns 0 with neither fix nor start', () => {
    expect(estimatePosition(wps, null, null, Date.now())).toBe(0)
  })
})

describe('elevation handling', () => {
  it('yields finite ETAs and zero ascent when every elevation is null', () => {
    const wps = applyPace(resample(line(120, () => null)), 'hiking')
    expect(wps[wps.length - 1].cumAscentM).toBe(0)
    for (const w of wps) expect(Number.isFinite(w.etaOffsetS)).toBe(true)
    expect(wps[wps.length - 1].etaOffsetS).toBeGreaterThan(0)
  })

  it('ignores sub-3 m jitter when summing ascent', () => {
    const jitter = line(60, (i) => 1000 + (i % 2 === 0 ? 0 : 2))
    expect(resample(jitter, 100)[59].cumAscentM).toBe(0)
  })
})

describe('resample', () => {
  it('caps at 60 waypoints and keeps first and last', () => {
    const pts = line(5000, (i) => 1000 + i)
    const wps = resample(pts)
    expect(wps.length).toBeLessThanOrEqual(60)
    expect(wps[0].lat).toBeCloseTo(pts[0].lat, 6)
    expect(wps[wps.length - 1].lat).toBeCloseTo(pts[pts.length - 1].lat, 6)
  })
})

describe('simplifyForMap', () => {
  it('decimates to at most 500 pairs preserving the ends', () => {
    const pts = line(1200, () => null)
    const simplified = simplifyForMap(pts)
    expect(simplified.length).toBeLessThanOrEqual(500)
    expect(simplified[0]).toEqual([
      Math.round(pts[0].lat * 1e5) / 1e5,
      Math.round(pts[0].lon * 1e5) / 1e5
    ])
    const last = pts[pts.length - 1]
    expect(simplified[simplified.length - 1]).toEqual([
      Math.round(last.lat * 1e5) / 1e5,
      Math.round(last.lon * 1e5) / 1e5
    ])
  })
})

describe('bboxOf', () => {
  it('bounds every point', () => {
    const [minLat, minLon, maxLat, maxLon] = bboxOf(line(50, () => null))
    expect(minLat).toBeLessThan(maxLat)
    expect(minLon).toBeLessThan(maxLon)
  })
})
