import { DEFAULT_SCHEDULE, type Schedule } from './schedule'
import type { ProfileId, Waypoint } from './track'
import { DEFAULT_THRESHOLDS, type Thresholds, type Warning } from './warnings'
import type { Hour, WaypointForecast } from './weather'

export type Track = {
  name: string
  nameSource: 'user' | 'gpx' | 'share' | 'filename'
  profile: ProfileId
  gpxText: string
  waypoints: Waypoint[]
  simplified: [number, number][]
  bbox: [number, number, number, number]
  lengthM: number
  ascentM: number
  eleSource: 'gpx' | 'dem' | 'none'
  startedAt: number | null
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
  metSymbols: Record<number, string | null>
  metThunder: Record<number, number | null>
  warnings: Warning[]
}

export type Stored = {
  track: Track | null
  fix: Fix | null
  thresholds: Thresholds
  schedule: Schedule
  forecast: Forecast | null
  lastFetchError: { at: number; message: string } | null
  vapidPublicKey: string | null
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
  vapidPublicKey: null
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
  return v === undefined ? DEFAULTS[k] : v
}

export async function set<K extends keyof Stored>(k: K, v: Stored[K]): Promise<void> {
  await tx('readwrite', (s) => s.put(v, k))
}

/** Keeps thresholds and schedule: they are preferences, not track data. */
export async function clearTrack(): Promise<void> {
  await set('track', null)
  await set('fix', null)
  await set('forecast', null)
  await set('lastFetchError', null)
}
