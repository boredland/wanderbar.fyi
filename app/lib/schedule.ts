export type Schedule = {
  enabled: boolean
  intervalH: number
  startH: number
  endH: number
  tz: string
}

export const DEFAULT_SCHEDULE: Schedule = {
  enabled: false,
  intervalH: 3,
  startH: 7,
  endH: 19,
  tz: (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  })()
}

const HOUR_MS = 3600_000

export function isValidSchedule(s: Schedule): boolean {
  return (
    Number.isInteger(s.intervalH) &&
    s.intervalH >= 1 &&
    s.intervalH <= 12 &&
    Number.isInteger(s.startH) &&
    s.startH >= 0 &&
    s.startH <= 23 &&
    Number.isInteger(s.endH) &&
    s.endH >= 0 &&
    s.endH <= 23 &&
    s.startH < s.endH &&
    typeof s.tz === 'string' &&
    s.tz.length > 0
  )
}

/** Local wall-clock hour in the schedule's zone; DST-correct via Intl. */
function localHour(tz: string, ms: number): number {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false
  }).format(new Date(ms))
  return Number(s) % 24
}

export function isWithinActiveHours(s: Schedule, nowMs: number): boolean {
  const h = localHour(s.tz, nowMs)
  return h >= s.startH && h <= s.endH
}

/**
 * Scans forward hour by hour rather than doing arithmetic on a local
 * timestamp: that is correct across both DST transitions without special
 * cases, where a local hour can be missing or ambiguous.
 */
export function nextWakeMs(s: Schedule, nowMs: number): number | null {
  if (!s.enabled) return null

  const start = Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS
  for (let i = 0; i < 48; i++) {
    const candidate = start + i * HOUR_MS
    const h = localHour(s.tz, candidate)
    if (h < s.startH || h > s.endH) continue
    if ((h - s.startH) % s.intervalH !== 0) continue
    return candidate
  }
  return null
}
