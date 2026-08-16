import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE } from './schedule'
import { DEFAULT_PROFILE, DEFAULT_REST } from './track'
import { DEFAULT_THRESHOLDS } from './warnings'
import { clearTrack, get, set, type Track } from './store'

/**
 * The page and the service worker share this database, and a background push
 * reads it with no UI to correct a bad value. These pin the two things that
 * cannot be observed from a screen: that an untouched key answers with its
 * default rather than undefined, and that a record written before a field
 * existed still comes back whole.
 */

/**
 * `store.ts` memoises its open database, so the data is wiped between tests
 * rather than the module: a second connection can clear the object store while
 * the memoised handle stays valid. Without this, "an untouched key" would mean
 * "whatever the previous test left behind".
 */
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

beforeEach(wipe)

const track = (over: Partial<Track> = {}): Track => ({
  name: 'Test route',
  nameSource: 'gpx',
  profile: DEFAULT_PROFILE,
  rest: DEFAULT_REST,
  gpxText: '<gpx/>',
  waypoints: [],
  simplified: [],
  bbox: [46, 8, 47, 9],
  lengthM: 12000,
  ascentM: 800,
  descentM: 600,
  eleSource: 'gpx',
  startAt: null,
  addedAt: 1_800_000_000_000,
  ...over
})

describe('defaults', () => {
  it('answers an untouched key with its default, never undefined', async () => {
    expect(await get('track')).toBeNull()
    expect(await get('fix')).toBeNull()
    expect(await get('forecast')).toBeNull()
    expect(await get('locale')).toBeNull()
    expect(await get('thresholds')).toEqual(DEFAULT_THRESHOLDS)
    expect(await get('schedule')).toEqual(DEFAULT_SCHEDULE)
  })
})

describe('round trip', () => {
  it('returns a stored value unchanged', async () => {
    const t = track({ name: 'Hardergrat' })
    await set('track', t)
    expect(await get('track')).toEqual(t)
  })

  it('stores null without falling back to the default', async () => {
    await set('track', track())
    await set('track', null)
    expect(await get('track')).toBeNull()
  })
})

describe('records written before a field existed', () => {
  it('fills in rest, startAt and descentM rather than returning them undefined', async () => {
    // A track stored by an older build still has to render on a mountain.
    const old = track()
    delete (old as Partial<Track>).rest
    delete (old as Partial<Track>).startAt
    delete (old as Partial<Track>).descentM
    await set('track', old)

    const got = (await get('track'))!
    expect(got.rest).toBe(DEFAULT_REST)
    expect(got.startAt).toBeNull()
    // 0 reads as "not known" rather than a figure invented from waypoints.
    expect(got.descentM).toBe(0)
  })

  it('keeps the stored values when they are present', async () => {
    await set('track', track({ rest: 'none', startAt: 123, descentM: 640 }))
    const got = (await get('track'))!
    expect(got.rest).toBe('none')
    expect(got.startAt).toBe(123)
    expect(got.descentM).toBe(640)
  })

  it('merges a missing threshold switch instead of dropping the condition', async () => {
    // A condition added after this record was written must still be togglable,
    // and must default to on rather than vanishing from the settings screen.
    const { deepsnow: _omitted, ...enabled } = DEFAULT_THRESHOLDS.enabled
    await set('thresholds', { ...DEFAULT_THRESHOLDS, enabled } as never)

    const got = await get('thresholds')
    expect(got.enabled.deepsnow).toBe(DEFAULT_THRESHOLDS.enabled.deepsnow)
    expect(got.heatC).toBe(DEFAULT_THRESHOLDS.heatC)
  })
})

describe('clearTrack', () => {
  it('drops the track data and keeps the preferences', async () => {
    await set('track', track())
    await set('fix', {
      at: 1,
      lat: 46.5,
      lon: 8,
      accuracyM: 10,
      rawAltitudeUnknownDatumM: null,
      snappedSeq: 0,
      snappedDistM: 0
    })
    await set('lastFetchError', { at: 1, message: 'boom' })
    await set('locale', 'de')
    await set('thresholds', { ...DEFAULT_THRESHOLDS, heatC: 31 })

    await clearTrack()

    expect(await get('track')).toBeNull()
    expect(await get('fix')).toBeNull()
    expect(await get('forecast')).toBeNull()
    expect(await get('lastFetchError')).toBeNull()
    // Preferences are not track data: clearing one must not clear the other.
    expect(await get('locale')).toBe('de')
    expect((await get('thresholds')).heatC).toBe(31)
  })
})
