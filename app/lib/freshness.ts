/**
 * How much trust the forecast on screen still deserves.
 *
 * Age is the only thing standing between a cached app and a confident lie.
 * Offline, wanderbar renders a complete-looking page out of IndexedDB, and the
 * numbers in it are exactly as old as the last successful sync. One scale lives
 * here because four places state it — the notice above the page, the freshness
 * row, the verdict and the timeline — and they must never disagree about
 * whether the numbers are still worth reading.
 */
export type Freshness = 'fresh' | 'aging' | 'stale' | 'expired'

/**
 * Two hours is roughly one model update. Past six the hour-by-hour shape of a
 * mountain day has moved on. Past twelve the forecast describes a different day
 * than the one being walked, and no amount of styling makes it readable again,
 * so `expired` withdraws the verdict rather than dressing it down.
 */
const AGING_MS = 2 * 3600_000
const STALE_MS = 6 * 3600_000
const EXPIRED_MS = 12 * 3600_000

/** No forecast at all is treated as the oldest case, never as the freshest. */
export function freshnessOf(fetchedAt: number | null, now: number): Freshness {
  if (fetchedAt === null) return 'expired'
  const age = now - fetchedAt
  if (age >= EXPIRED_MS) return 'expired'
  if (age >= STALE_MS) return 'stale'
  if (age >= AGING_MS) return 'aging'
  return 'fresh'
}

export const MINUTE_MS = 60_000
export const HOUR_MS = 3600_000
export const DAY_MS = 86_400_000
