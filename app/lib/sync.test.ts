import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AvalancheModule from './avalanche'
import type * as WeatherModule from './weather'
import type * as FireRankingModule from './fire-ranking'
import type * as LightningModule from './lightning'
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
const fetchLightning = vi.hoisted(() => vi.fn())
const fetchFireRanking = vi.hoisted(() => vi.fn())

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
vi.mock('./lightning', async (importOriginal) => ({
  ...(await importOriginal<typeof LightningModule>()),
  fetchLightning
}))
vi.mock('./fire-ranking', async (importOriginal) => ({
  ...(await importOriginal<typeof FireRankingModule>()),
  fetchFireRanking
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
  burns: [],
  nearestBurnM: null,
  insideBurn: false,
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
  fetchLightning.mockResolvedValue([])
  fetchFireRanking.mockResolvedValue([])
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

describe('a waypoint the hiker has walked past', () => {
  /**
   * `next` only ever holds warnings at or ahead of the hiker, so a warning
   * behind them disappears because they moved, not because the weather did.
   * Reporting that as cleared is a false all-clear, which is the one direction
   * this app must never be wrong in.
   */
  it('is not reported as cleared just because it was walked past', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS, [1, 8]))
    const first = await syncNow()
    expect(first.worsened.map((w) => `${w.seq}:${w.condition}`)).toEqual(
      expect.arrayContaining(['1:wind', '8:wind'])
    )

    // Five hours later the hiker is at waypoint 5, and the gale at 8 still blows.
    vi.setSystemTime(NOW + 5 * 3600_000)
    fetchOpenMeteo.mockResolvedValue(forecastFor([5, 6, 7, 8, 9], [8]))

    const second = await syncNow()

    expect(second.cleared).toEqual([])
  })

  it('still reports a warning that genuinely lifted ahead of them', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS, [1, 8]))
    await syncNow()

    // Same position change, but this time the gale at 8 has actually gone.
    vi.setSystemTime(NOW + 5 * 3600_000)
    fetchOpenMeteo.mockResolvedValue(forecastFor([5, 6, 7, 8, 9], []))

    const second = await syncNow()

    expect(second.cleared.map((w) => `${w.seq}:${w.condition}`)).toEqual(['8:wind'])
  })
})

/**
 * A reading that could not be fetched is not a reading of zero. `diffWarnings`
 * treats a warning that vanished as one that cleared, and clearing is what
 * sends "the risk has lifted" to a lock screen, so a dropped connection must
 * not be able to produce that sentence.
 */
describe('a failed lightning fetch never reads as the risk lifting', () => {
  it('keeps the previous reading when the service cannot be reached', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS))

    const today = new Date(NOW).toISOString().slice(0, 10)
    fetchLightning.mockResolvedValueOnce([{ date: today, flashesPerKm2: 9 }])
    await syncNow()
    expect((await get('forecast'))?.lightningByDate).toEqual({ [today]: 9 })

    // Now the service is down and answers for no day at all.
    fetchLightning.mockResolvedValueOnce([])
    const delta = await syncNow()

    // The reading survives, so the warning does, so nothing "cleared".
    expect((await get('forecast'))?.lightningByDate).toEqual({ [today]: 9 })
    expect(delta.cleared.filter((w) => w.condition === 'lightning')).toEqual([])
  })

  it('replaces a carried reading as soon as the service answers again', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS))

    const today = new Date(NOW).toISOString().slice(0, 10)
    fetchLightning.mockResolvedValueOnce([{ date: today, flashesPerKm2: 9 }])
    await syncNow()
    fetchLightning.mockResolvedValueOnce([{ date: today, flashesPerKm2: 0.1 }])
    await syncNow()
    expect((await get('forecast'))?.lightningByDate).toEqual({ [today]: 0.1 })
  })
})

/**
 * The percentile is context, so unlike the lightning readings its absence
 * cannot produce a false all-clear. It is still carried across syncs: a clause
 * that appears and vanishes between syncs reads as the climate record itself
 * changing, when all that changed was the connection.
 */
describe('the fire-weather percentile survives a sync that could not fetch it', () => {
  it('keeps the previous percentile and never throws into the sync', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS))

    const today = new Date(NOW).toISOString().slice(0, 10)
    fetchFireRanking.mockResolvedValueOnce([{ date: today, percentile: 98.9 }])
    await syncNow()
    expect((await get('forecast'))?.rankingByDate).toEqual({ [today]: 98.9 })

    // The service throws outright rather than resolving empty.
    fetchFireRanking.mockRejectedValueOnce(new Error('offline'))
    await syncNow()

    expect((await get('forecast'))?.rankingByDate).toEqual({ [today]: 98.9 })
    // And the sync itself completed: the forecast was still written.
    expect(await get('lastFetchError')).toBeNull()
  })

  it('drops readings for days already past, so the map cannot grow forever', async () => {
    await set('track', track())
    fetchOpenMeteo.mockResolvedValue(forecastFor(ALL_SEQS))

    const yesterday = new Date(NOW - 86400_000).toISOString().slice(0, 10)
    const today = new Date(NOW).toISOString().slice(0, 10)
    fetchFireRanking.mockResolvedValueOnce([
      { date: yesterday, percentile: 95 },
      { date: today, percentile: 97 }
    ])
    await syncNow()
    expect((await get('forecast'))?.rankingByDate).toEqual({ [today]: 97 })
  })
})
