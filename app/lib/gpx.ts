import { XMLParser } from 'fast-xml-parser'

import type { Pt } from './track'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (n) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept', 'wpt'].includes(n)
})

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toPt = (raw: Record<string, unknown>): Pt | null => {
  const lat = num(raw['@_lat'])
  const lon = num(raw['@_lon'])
  if (lat === null || lon === null) return null
  const t = raw['time']
  const parsed = typeof t === 'string' ? Date.parse(t) : NaN
  return {
    lat,
    lon,
    ele: num(raw['ele']),
    time: Number.isFinite(parsed) ? parsed : null
  }
}

export function parseGpx(xml: string): { name: string; points: Pt[]; sparse: boolean } {
  const doc = parser.parse(xml)
  const gpx = doc?.gpx
  if (!gpx) throw new Error('not gpx')

  const trks = (gpx.trk ?? []) as Record<string, unknown>[]
  const points: Pt[] = []
  for (const trk of trks) {
    for (const seg of (trk.trkseg ?? []) as Record<string, unknown>[]) {
      for (const p of (seg.trkpt ?? []) as Record<string, unknown>[]) {
        const pt = toPt(p)
        if (pt) points.push(pt)
      }
    }
  }

  let sparse = false
  if (points.length < 2) {
    sparse = true
    for (const rte of (gpx.rte ?? []) as Record<string, unknown>[]) {
      for (const p of (rte.rtept ?? []) as Record<string, unknown>[]) {
        const pt = toPt(p)
        if (pt) points.push(pt)
      }
    }
    for (const p of (gpx.wpt ?? []) as Record<string, unknown>[]) {
      const pt = toPt(p)
      if (pt) points.push(pt)
    }
  }

  const trkName = trks[0]?.name
  const metaName = (gpx.metadata as Record<string, unknown> | undefined)?.name
  const name =
    (typeof trkName === 'string' && trkName.trim()) ||
    (typeof metaName === 'string' && metaName.trim()) ||
    'Unnamed track'

  return { name, points, sparse }
}
