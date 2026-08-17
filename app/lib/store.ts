import type { Bulletin } from './avalanche'
import type { Wildfires } from './wildfire'
import type { Locale } from './i18n/locale'
import { DEFAULT_SCHEDULE, type Schedule } from './schedule'
import { DEFAULT_REST, type ProfileId, type RestId, type Waypoint } from './track'
import { DEFAULT_THRESHOLDS, type Thresholds, type Warning } from './warnings'
import type { Hour, WaypointForecast } from './weather'

export type Track = {
  name: string
  nameSource: 'user' | 'gpx' | 'share' | 'filename'
  profile: ProfileId
  /** Breaks are not in the published pace constants; this scales them. */
  rest: RestId
  gpxText: string
  waypoints: Waypoint[]
  simplified: [number, number][]
  bbox: [number, number, number, number]
  lengthM: number
  ascentM: number
  descentM: number
  eleSource: 'gpx' | 'dem' | 'none'
  /**
   * Planned start, epoch ms; may be in the future. Null means "assume now".
   * A measured fix overrides it; see startAnchorMs.
   */
  startAt: number | null
  addedAt: number
}

export type Fix = {
  at: number
  lat: number
  lon: number
  accuracyM: number | null
  /** Diagnostics only: the datum differs per OS and is never read. */
  rawAltitudeUnknownDatumM: number | null
  snappedSeq: number
  snappedDistM: number
}

export type Forecast = {
  fetchedAt: number
  currentSeq: number
  waypoints: WaypointForecast[]
  met: Record<number, Hour[]>
  /** Computed FWI per UTC date; see runFwi in ./fwi. */
  fwiByDate: Record<string, number>
  /**
   * Forecast flash density per UTC date; see fetchLightning in ./lightning.
   * Absent for forecasts stored before the feature existed, and empty when the
   * service could not be read, which is not the same as a quiet sky.
   */
  lightningByDate?: Record<string, number>
  warnings: Warning[]
  /**
   * Official avalanche bulletin, deliberately outside `warnings`: it is
   * regional rather than per-waypoint, and its absence never means safe.
   * Null only for forecasts stored before the feature existed.
   */
  avalanche: Bulletin | null
  /**
   * Fires observed burning near the route, deliberately outside `warnings` for
   * the same reason as `avalanche`: a satellite detection is an observation,
   * not a forecast, and its absence means nobody looked rather than nothing
   * burns. Null only for forecasts stored before the feature existed.
   */
  wildfires: Wildfires | null
}

export type Stored = {
  track: Track | null
  fix: Fix | null
  thresholds: Thresholds
  schedule: Schedule
  forecast: Forecast | null
  lastFetchError: { at: number; message: string } | null
  vapidPublicKey: string | null
  /**
   * The reader's chosen language, or null while they have not chosen one.
   *
   * Null rather than 'en' so a first visit can follow Accept-Language without
   * that guess ever looking like a decision the reader made: the moment they
   * pick one it is stored, and from then on it outranks both the header and
   * the path. The service worker reads this for notification text, which is
   * the reason it lives here and not only in the URL.
   */
  locale: Locale | null
}

const DB_NAME = 'wanderbar'
const DB_VERSION = 1
const STORE = 'state'

const DEFAULTS: Stored = {
  track: null,
  fix: null,
  thresholds: DEFAULT_THRESHOLDS,
  schedule: DEFAULT_SCHEDULE,
  forecast: null,
  lastFetchError: null,
  vapidPublicKey: null,
  locale: null
}

let dbPromise: Promise<IDBDatabase> | null = null

// No window/document references: the service worker imports this module and
// shares the page's origin-scoped database.
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    dbPromise = promise
  }
  return dbPromise
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDb()
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  const req = run(db.transaction(STORE, mode).objectStore(STORE))
  req.onsuccess = () => resolve(req.result as T)
  req.onerror = () => reject(req.error)
  return promise
}

export async function get<K extends keyof Stored>(k: K): Promise<Stored[K]> {
  const v = await tx<Stored[K] | undefined>('readonly', (s) => s.get(k))
  if (v === undefined) return DEFAULTS[k]
  // Tracks stored before a field existed still have to render.
  if (k === 'track' && v !== null) {
    const t = v as Track
    return {
      ...t,
      rest: t.rest ?? DEFAULT_REST,
      startAt: t.startAt ?? null,
      // Tracks stored before descent was measured: 0 reads as "not known"
      // rather than fabricating a figure from resampled waypoints.
      descentM: t.descentM ?? 0
    } as Stored[K]
  }
  if (k === 'thresholds') {
    const t = v as Thresholds
    return {
      ...DEFAULT_THRESHOLDS,
      ...t,
      enabled: { ...DEFAULT_THRESHOLDS.enabled, ...t.enabled }
    } as Stored[K]
  }
  return v
}

export async function set<K extends keyof Stored>(k: K, v: Stored[K]): Promise<void> {
  await tx('readwrite', (s) => s.put(v, k))
}

/** Keeps thresholds, schedule and locale: preferences, not track data. */
export async function clearTrack(): Promise<void> {
  await set('track', null)
  await set('fix', null)
  await set('forecast', null)
  await set('lastFetchError', null)
}
