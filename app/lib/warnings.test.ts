import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  diffWarnings,
  evaluateWarnings,
  type Condition,
  type Thresholds,
  type Warning
} from './warnings'
import type { Waypoint } from './track'
import type { Hour, SunDay, WaypointForecast } from './weather'

const NOW = 1_800_000_000_000

const wp = (seq: number, etaOffsetS: number): Waypoint => ({
  seq,
  lat: 47.42,
  lon: 10.98,
  eleM: 1200,
  cumDistM: seq * 2000,
  cumAscentM: 0,
  etaOffsetS
})

const hour = (over: Partial<Hour> = {}): Hour => ({
  t: NOW,
  tempC: 12,
  apparentC: 12,
  precipMm: 0,
  precipProb: 0,
  snowfallCm: 0,
  windKmh: 5,
  gustKmh: 5,
  code: 1,
  capeJkg: 0,
  ...over
})

/** NOW sits mid-daylight, so darkness never fires unless a test asks for it. */
const DAYLIGHT: SunDay[] = [{ sunriseMs: NOW - 6 * 3600_000, sunsetMs: NOW + 6 * 3600_000 }]

const forecast = (h: Hour, seq = 0): WaypointForecast[] => [
  { seq, hours: [h], sun: DAYLIGHT }
]

const conditions = (ws: Warning[]): Condition[] => ws.map((w) => w.condition).sort()

const thresholds = (over: Partial<Thresholds> = {}): Thresholds => ({
  ...DEFAULT_THRESHOLDS,
  ...over
})

const evaluate = (h: Hour, t: Thresholds = DEFAULT_THRESHOLDS, extras = {}) =>
  evaluateWarnings(t, forecast(h), [wp(0, 0)], 0, NOW, extras)

describe('evaluateWarnings', () => {
  it('derives both hail and thunderstorm from code 96', () => {
    expect(conditions(evaluate(hour({ code: 96 })))).toEqual(['hail', 'thunderstorm'])
  })

  it('warns on gusts at or above the threshold only', () => {
    expect(conditions(evaluate(hour({ gustKmh: 55 })))).toEqual(['wind'])
    expect(conditions(evaluate(hour({ gustKmh: 45 })))).toEqual([])
  })

  it('applies the heat threshold at the boundary', () => {
    const h = hour({ tempC: 29, apparentC: 29 })
    expect(conditions(evaluate(h, thresholds({ heatC: 28 })))).toEqual(['heat'])
    expect(conditions(evaluate(h, thresholds({ heatC: 30 })))).toEqual([])
  })

  it('distinguishes blizzard from plain snow by temperature', () => {
    const cold = hour({ snowfallCm: 2, gustKmh: 45, tempC: -3, apparentC: -3, code: 73 })
    expect(conditions(evaluate(cold))).toEqual(['blizzard', 'snow'])
    const mild = hour({ snowfallCm: 2, gustKmh: 45, tempC: 2, apparentC: 2, code: 73 })
    expect(conditions(evaluate(mild))).toEqual(['snow'])
  })

  it('ignores hours outside the ±1 h ETA window', () => {
    const far = hour({ t: NOW + 4 * 3600_000, gustKmh: 90 })
    expect(conditions(evaluate(far))).toEqual([])
  })

  it('honours a disabled condition', () => {
    const t = thresholds({ enabled: { ...DEFAULT_THRESHOLDS.enabled, wind: false } })
    expect(conditions(evaluate(hour({ gustKmh: 90 }), t))).toEqual([])
  })

  it('raises thunderstorm from MET probability when the code is quiet', () => {
    const extras = { 0: { probabilityOfThunder: 40 } }
    expect(conditions(evaluate(hour(), DEFAULT_THRESHOLDS, extras))).toEqual(['thunderstorm'])
  })

  it('skips waypoints already behind the hiker', () => {
    const wps = [wp(0, 0), wp(1, 3600)]
    const fc: WaypointForecast[] = [
      { seq: 0, hours: [hour({ gustKmh: 90 })], sun: DAYLIGHT },
      { seq: 1, hours: [hour({ t: NOW + 3600_000, gustKmh: 90 })], sun: DAYLIGHT }
    ]
    const got = evaluateWarnings(DEFAULT_THRESHOLDS, fc, wps, 1, NOW)
    expect(got.map((w) => w.seq)).toEqual([1])
  })
})

describe('fire danger', () => {
  const date = new Date(NOW).toISOString().slice(0, 10)
  const run = (fwi: number, min = DEFAULT_THRESHOLDS.fireDanger) =>
    evaluateWarnings(
      { ...DEFAULT_THRESHOLDS, fireDanger: min },
      forecast(hour()),
      [wp(0, 0)],
      0,
      NOW,
      {},
      { [date]: fwi }
    ).filter((w) => w.condition === 'fire')

  it('stays quiet below the configured class', () => {
    // Default threshold is 'high' (FWI >= 21.3).
    expect(run(12)).toHaveLength(0)
  })

  it('warns at and above the configured class', () => {
    const got = run(30)
    expect(got).toHaveLength(1)
    expect(got[0].detail).toBe('high, FWI 30')
  })

  it('respects a stricter threshold', () => {
    expect(run(30, 'extreme')).toHaveLength(0)
    expect(run(60, 'extreme')[0].detail).toContain('extreme')
  })

  it('respects a looser threshold', () => {
    expect(run(15, 'moderate')[0].detail).toContain('moderate')
  })

  it('stays quiet when no fire data is available for that day', () => {
    expect(
      evaluateWarnings(DEFAULT_THRESHOLDS, forecast(hour()), [wp(0, 0)], 0, NOW, {}, {})
        .filter((w) => w.condition === 'fire')
    ).toHaveLength(0)
  })

  it('honours the disabled toggle', () => {
    const t = { ...DEFAULT_THRESHOLDS, enabled: { ...DEFAULT_THRESHOLDS.enabled, fire: false } }
    expect(
      evaluateWarnings(t, forecast(hour()), [wp(0, 0)], 0, NOW, {}, { [date]: 99 })
        .filter((w) => w.condition === 'fire')
    ).toHaveLength(0)
  })
})

describe('darkness', () => {
  const sun: SunDay[] = [
    { sunriseMs: NOW - 2 * 3600_000, sunsetMs: NOW + 2 * 3600_000 }
  ]
  const at = (anchor: number) =>
    evaluateWarnings(
      DEFAULT_THRESHOLDS,
      [{ seq: 0, hours: [hour({ t: anchor })], sun }],
      [wp(0, 0)],
      0,
      anchor
    ).filter((w) => w.condition === 'darkness')

  it('stays quiet in broad daylight', () => {
    expect(at(NOW)).toHaveLength(0)
  })

  it('warns well after sunset', () => {
    const got = at(NOW + 5 * 3600_000)
    expect(got).toHaveLength(1)
    expect(got[0].detail).toBe('in the dark')
  })

  it('warns before sunrise', () => {
    expect(at(NOW - 5 * 3600_000)[0].detail).toBe('in the dark')
  })

  it('flags the dusk window, which catches people out on a descent', () => {
    expect(at(NOW + 2 * 3600_000 - 10 * 60_000)[0].detail).toMatch(/^dusk, sunset /)
  })

  it('flags the hour just after sunset separately from full dark', () => {
    expect(at(NOW + 2 * 3600_000 + 10 * 60_000)[0].detail).toMatch(/^after sunset /)
  })

  it('honours the disabled toggle', () => {
    const t = { ...DEFAULT_THRESHOLDS, enabled: { ...DEFAULT_THRESHOLDS.enabled, darkness: false } }
    const anchor = NOW + 5 * 3600_000
    const got = evaluateWarnings(t, [{ seq: 0, hours: [hour({ t: anchor })], sun }], [wp(0, 0)], 0, anchor)
    expect(got.filter((w) => w.condition === 'darkness')).toHaveLength(0)
  })

  it('does not throw when sun data is missing', () => {
    expect(() =>
      evaluateWarnings(DEFAULT_THRESHOLDS, [{ seq: 0, hours: [hour()], sun: [] }], [wp(0, 0)], 0, NOW)
    ).not.toThrow()
  })
})

describe('one warning per waypoint and condition', () => {
  it('collapses several in-window hours to the one nearest the ETA', () => {
    const hours = [
      hour({ t: NOW - 3600_000, tempC: 31, apparentC: 31 }),
      hour({ t: NOW, tempC: 34, apparentC: 34 }),
      hour({ t: NOW + 3600_000, tempC: 32, apparentC: 32 })
    ]
    const got = evaluateWarnings(
      DEFAULT_THRESHOLDS,
      [{ seq: 0, hours, sun: DAYLIGHT }],
      [wp(0, 0)],
      0,
      NOW
    )
    expect(got).toHaveLength(1)
    // The ETA hour is 34 °C, not the neighbouring hours.
    expect(got[0].detail).toBe('34.0 °C')
    expect(got[0].forecastHour).toBe(NOW)
  })

  it('still reports distinct conditions separately', () => {
    const h = hour({ tempC: 33, apparentC: 33, gustKmh: 70 })
    expect(conditions(evaluate(h))).toEqual(['heat', 'wind'])
  })
})

describe('warning windows follow the start anchor', () => {
  it('matches the hour at the planned start, not the hour at now', () => {
    const tomorrow = NOW + 86400_000
    const gusty = hour({ t: tomorrow, gustKmh: 80 })
    // Anchored to tomorrow, that hour lines up with the waypoint's ETA.
    // Filtered to wind: the fixture's sun day makes tomorrow dark, which
    // legitimately raises a darkness warning too.
    expect(
      conditions(evaluateWarnings(DEFAULT_THRESHOLDS, forecast(gusty), [wp(0, 0)], 0, tomorrow))
    ).toContain('wind')
    // Anchored to now, the same hour is a day away and must not fire.
    expect(
      conditions(evaluateWarnings(DEFAULT_THRESHOLDS, forecast(gusty), [wp(0, 0)], 0, NOW))
    ).not.toContain('wind')
  })
})

describe('diffWarnings', () => {
  const w = (seq: number, condition: Condition, forecastHour = NOW): Warning => ({
    seq,
    condition,
    forecastHour,
    detail: 'x'
  })

  it('reports nothing for identical sets', () => {
    const set = [w(1, 'rain'), w(2, 'wind')]
    expect(diffWarnings(set, set)).toEqual({ worsened: [], cleared: [] })
  })

  it('reports a newly appeared warning as worsened', () => {
    const d = diffWarnings([w(1, 'rain')], [w(1, 'rain'), w(7, 'thunderstorm')])
    expect(d.cleared).toEqual([])
    expect(d.worsened.map((x) => [x.seq, x.condition])).toEqual([[7, 'thunderstorm']])
  })

  it('reports a vanished warning as cleared', () => {
    const d = diffWarnings([w(5, 'rain'), w(1, 'wind')], [w(1, 'wind')])
    expect(d.worsened).toEqual([])
    expect(d.cleared.map((x) => [x.seq, x.condition])).toEqual([[5, 'rain']])
  })

  it('stays silent when only forecastHour drifts', () => {
    const prev = [w(1, 'rain'), w(2, 'wind')]
    const next = [w(1, 'rain', NOW + 1_800_000), w(2, 'wind', NOW + 1_800_000)]
    expect(diffWarnings(prev, next)).toEqual({ worsened: [], cleared: [] })
  })
})
