import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AvalancheModule from './avalanche'
import type * as WeatherModule from './weather'
import type * as WildfireModule from './wildfire'
import type { Bulletin } from './avalanche'
import type { Track } from './store'
import type { Waypoint } from './track'
import type { Hour, WaypointForecast } from './weather'
import type { Wildfires } from './wildfire'

/**
 * `syncNow` is the one function that decides whether a lock screen buzzes on a
 * mountain. These cover the orchestration around that decision: what it stores,
 * what it refuses to store, and the two ways a slow fetch can be overtaken by
 * the reader.
 *
 * The network edges are stubbed; the diff, the position estimate and the
 * IndexedDB writes are real, because those are the parts that decide.
 */

const NOW = 1_800_000_000_000

const fetchOpenMeteo = vi.hoisted(() => vi.fn())
const fetchMet = vi.hoisted(() => vi.fn())
const fetchFwiInputs = vi.hoisted(() => vi.fn())
const fetchBulletin = vi.hoisted(() => vi.fn())
const fetchWildfires = vi.hoisted(() => vi.fn())

vi.mock('./weather', async (importOriginal) => ({
  ...(await importOriginal<typeof WeatherModule>()),
  fetchOpenMeteo,
  fetchMet,
  fetchFwiInputs
}))
vi.mock('./avalanche', async (importOriginal) => ({
  ...(await importOriginal<typeof AvalancheModule>()),
  fetchBulletin
}))
vi.mock('./wildfire', async (importOriginal) => ({
  ...(await importOriginal<typeof WildfireModule>()),
  fetchWildfires
}))

// Static imports would bind before vi.mock's hoisted factories are installed,
// so the module under test has to be pulled in after them.
const { syncNow } = await import('./sync')
const { get, set } = await import('./store')

const wp = (seq: number, etaOffsetS: number): Waypoint => ({
  seq,
  lat: 46.5 + seq / 1000,
  lon: 8 + seq / 1000,
  eleM: 2000,
  cumDistM: seq * 1000,
  cumAscentM: seq * 50,
  etaOffsetS
})

/** Ten waypoints, one hour apart, so a currentSeq can be aimed precisely. */
const WAYPOINTS = Array.from({ length: 10 }, (_, i) => wp(i, i * 3600))

const track = (over: Partial<Track> = {}): Track => ({
  name: 'Test route',
  nameSource: 'gpx',
  profile: 'hiking',
  rest: 'none',
  gpxText: '<gpx/>',
  waypoints: WAYPOINTS,
  simplified: [],
  bbox: [46, 8, 47, 9],
  lengthM: 9000,
  ascentM: 450,
  descentM: 0,
  eleSource: 'gpx',
  startAt: NOW,
  addedAt: 1,
  ...over
})

const hour = (t: number, over: Partial<Hour> = {}): Hour => ({
  t,
  tempC: 12,
  apparentC: 12,
  precipMm: 0,
  precipProb: 0,
  snowfallCm: 0,
  snowDepthM: 0,
  windKmh: 5,
  gustKmh: 5,
  code: 1,
  capeJkg: 0,
  ...over
})

/** Mid-daylight either side, so darkness never fires unless asked for. */
const sunAround = (t: number) => [{ sunriseMs: t - 6 * 3600_000, sunsetMs: t + 6 * 3600_000 }]

const ALL_SEQS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * A forecast for the given waypoints where `gusty` raises a wind warning at
 * that waypoint's ETA and nowhere else.
 */
const forecastFor = (seqs: number[], gusty: number[] = []): WaypointForecast[] =>
  seqs.map((seq) => {
    const t = NOW + seq * 3600_000
    return {
      seq,
      hours: [hour(t, gusty.includes(seq) ? { gustKmh: 90, windKmh: 70 } : {})],
      sun: sunAround(t)
    }
  })

const NO_BULLETIN: Bulletin = {
  status: 'no-coverage',
  level: null,
  provider: '',
  providerUrl: '',
  region: null,
  headline: null,
  bands: [],
  problems: [],
  validUntilMs: null,
  fetchedAtMs: NOW
}

const NO_FIRES: Wildfires = {
  status: 'none',
  hotspots: [],
  nearestM: null,
  latestAtMs: null,
  truncated: false,
  windowHours: 48,
  provider: '',
  providerUrl: '',
  fetchedAtMs: NOW
}

function wipe(): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const open = indexedDB.open('wanderbar', 1)
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains('state')) open.result.createObjectStore('state')
  }
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const db = open.result
    const req = db.transaction('state', 'readwrite').objectStore('state').clear()
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  }
  return promise
}

beforeEach(async () => {
  await wipe()
  vi.clearAllMocks()
  // Only Date: fake-indexeddb drives its own requests off real timers, and
  // faking those deadlocks every await in this file.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fetchMet.mockRejectedValue(new Error('met unavailable'))
  fetchFwiInputs.mockRejectedValue(new Error('fwi unavailable'))
  fetchBulletin.mockResolvedValue(NO_BULLETIN)
  fetchWildfires.mockResolvedValue(NO_FIRES)
})

describe('with no track', () => {
  it('does no fetching at all', async () => {
    const delta = await syncNow()
    expect(delta).toEqual({ worsened: [], cleared: [] })
    expect(fetchOpenMeteo).not.toHaveBeenCalled()
  })
})

describe('a first sync', () => {
  it('stores the forecast and reports the new warnings as worsened', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS, [3]))

    const delta = await syncNow()

    expect(delta.worsened.map((w) => `${w.seq}:${w.condition}`)).toContain('3:wind')
    expect(delta.cleared).toEqual([])

    const stored = await get('forecast')
    expect(stored?.fetchedAt).toBeGreaterThan(0)
    expect(stored?.warnings.map((w) => `${w.seq}:${w.condition}`)).toContain('3:wind')
    expect(await get('lastFetchError')).toBeNull()
  })
})

describe('unchanged weather', () => {
  it('reports nothing the second time, which is the whole point of the diff', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS, [3]))

    const first = await syncNow()
    expect(first.worsened.length).toBeGreaterThan(0)

    const second = await syncNow()
    expect(second).toEqual({ worsened: [], cleared: [] })
  })
})

describe('a track replaced while the fetch was in flight', () => {
  it('discards the result rather than attributing it to the new track', async () => {
    await set('track', track())
    fetchOpenMeteo.mockImplementation(async () => {
      // The reader swaps tracks while the network is still answering.
      await set('track', track({ addedAt: 2, name: 'Another route' }))
      return forecastFor(ALL_SEQS, [3])
    })

    const delta = await syncNow()

    expect(delta).toEqual({ worsened: [], cleared: [] })
    expect(await get('forecast')).toBeNull()
  })

  it('discards it when only the planned start moved', async () => {
    // Changing startAt re-runs the sync, and two runs can land out of order.
    await set('track', track())
    fetchOpenMeteo.mockImplementation(async () => {
      await set('track', track({ startAt: NOW + 86400_000 }))
      return forecastFor(ALL_SEQS, [3])
    })

    const delta = await syncNow()

    expect(delta).toEqual({ worsened: [], cleared: [] })
    expect(await get('forecast')).toBeNull()
  })
})

describe('a failed fetch', () => {
  it('keeps the previous forecast and records why, rather than blanking the screen', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS, [3]))
    await syncNow()
    const before = await get('forecast')
    expect(before).not.toBeNull()

    fetchOpenMeteo.mockRejectedValue(new Error('offline'))
    await expect(syncNow()).rejects.toThrow('offline')

    expect(await get('forecast')).toEqual(before)
    const err = await get('lastFetchError')
    expect(err?.message).toContain('offline')
  })
})
