import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULE,
  isValidSchedule,
  isWithinActiveHours,
  nextWakeMs,
  type Schedule
} from './schedule'

const BERLIN: Schedule = {
  enabled: true,
  intervalH: 3,
  startH: 7,
  endH: 19,
  tz: 'Europe/Berlin'
}

/** Wall-clock Europe/Berlin instant, given its known UTC offset that day. */
const berlin = (iso: string, offsetH: number) => Date.parse(`${iso}:00.000Z`) - offsetH * 3600_000

const hourIn = (tz: string, ms: number) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(ms)))

const dayIn = (tz: string, ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit' }).format(new Date(ms))

describe('nextWakeMs', () => {
  it('advances to the next slot congruent to startH', () => {
    const next = nextWakeMs(BERLIN, berlin('2026-07-15T08:00', 2))
    expect(hourIn('Europe/Berlin', next!)).toBe(10)
  })

  it('rolls to the first slot next day after the window closes', () => {
    const now = berlin('2026-07-15T19:30', 2)
    const next = nextWakeMs(BERLIN, now)!
    expect(hourIn('Europe/Berlin', next)).toBe(7)
    expect(dayIn('Europe/Berlin', next)).toBe('16')
  })

  it('waits for the window to open when called before startH', () => {
    const next = nextWakeMs(BERLIN, berlin('2026-07-15T06:00', 2))
    expect(hourIn('Europe/Berlin', next!)).toBe(7)
  })

  it('lands only on whole hours', () => {
    const next = nextWakeMs(BERLIN, berlin('2026-07-15T08:17', 2))!
    expect(next % 3600_000).toBe(0)
  })

  it('emits every hour in the window at intervalH 1 and nothing at 20', () => {
    const hourly = { ...BERLIN, intervalH: 1 }
    const seen: number[] = []
    let cursor = berlin('2026-07-15T06:30', 2)
    for (let i = 0; i < 14; i++) {
      const next = nextWakeMs(hourly, cursor)!
      seen.push(hourIn('Europe/Berlin', next))
      cursor = next
    }
    expect(seen).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 7])
  })

  it('returns null when disabled', () => {
    expect(nextWakeMs({ ...BERLIN, enabled: false }, Date.now())).toBeNull()
  })

  it('returns a strictly future valid slot across the spring DST jump', () => {
    // 2026-03-29: Europe/Berlin skips 02:00→03:00 local.
    const now = Date.parse('2026-03-29T00:30:00.000Z')
    const next = nextWakeMs(BERLIN, now)!
    expect(next).toBeGreaterThan(now)
    const h = hourIn('Europe/Berlin', next)
    expect(h).toBeGreaterThanOrEqual(BERLIN.startH)
    expect(h).toBeLessThanOrEqual(BERLIN.endH)
    expect((h - BERLIN.startH) % BERLIN.intervalH).toBe(0)
  })

  it('returns a strictly future valid slot across the autumn DST repeat', () => {
    // 2026-10-25: Europe/Berlin repeats 02:00→03:00 local.
    const now = Date.parse('2026-10-25T00:30:00.000Z')
    const next = nextWakeMs(BERLIN, now)!
    expect(next).toBeGreaterThan(now)
    expect((hourIn('Europe/Berlin', next) - BERLIN.startH) % BERLIN.intervalH).toBe(0)
  })
})

describe('isWithinActiveHours', () => {
  it('brackets the window inclusively', () => {
    expect(isWithinActiveHours(BERLIN, berlin('2026-07-15T07:00', 2))).toBe(true)
    expect(isWithinActiveHours(BERLIN, berlin('2026-07-15T19:00', 2))).toBe(true)
    expect(isWithinActiveHours(BERLIN, berlin('2026-07-15T06:59', 2))).toBe(false)
    expect(isWithinActiveHours(BERLIN, berlin('2026-07-15T20:00', 2))).toBe(false)
  })
})

describe('isValidSchedule', () => {
  it('accepts the defaults', () => {
    expect(isValidSchedule({ ...DEFAULT_SCHEDULE, enabled: true })).toBe(true)
  })

  it('rejects out-of-range, reversed or fractional values', () => {
    expect(isValidSchedule({ ...BERLIN, intervalH: 0 })).toBe(false)
    expect(isValidSchedule({ ...BERLIN, intervalH: 13 })).toBe(false)
    expect(isValidSchedule({ ...BERLIN, intervalH: 1.5 })).toBe(false)
    expect(isValidSchedule({ ...BERLIN, startH: 19, endH: 7 })).toBe(false)
    expect(isValidSchedule({ ...BERLIN, startH: -1 })).toBe(false)
    expect(isValidSchedule({ ...BERLIN, endH: 24 })).toBe(false)
  })
})
