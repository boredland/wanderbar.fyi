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
import type { Hour, WaypointForecast } from './weather'

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

const forecast = (h: Hour, seq = 0): WaypointForecast[] => [{ seq, hours: [h] }]

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
      { seq: 0, hours: [hour({ gustKmh: 90 })] },
      { seq: 1, hours: [hour({ t: NOW + 3600_000, gustKmh: 90 })] }
    ]
    const got = evaluateWarnings(DEFAULT_THRESHOLDS, fc, wps, 1, NOW)
    expect(got.map((w) => w.seq)).toEqual([1])
  })
})

describe('one warning per waypoint and condition', () => {
  it('collapses several in-window hours to the one nearest the ETA', () => {
    const hours = [
      hour({ t: NOW - 3600_000, tempC: 31, apparentC: 31 }),
      hour({ t: NOW, tempC: 34, apparentC: 34 }),
      hour({ t: NOW + 3600_000, tempC: 32, apparentC: 32 })
    ]
    const got = evaluateWarnings(DEFAULT_THRESHOLDS, [{ seq: 0, hours }], [wp(0, 0)], 0, NOW)
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
    expect(
      evaluateWarnings(DEFAULT_THRESHOLDS, forecast(gusty), [wp(0, 0)], 0, tomorrow)
    ).toHaveLength(1)
    // Anchored to now, the same hour is a day away and must not fire.
    expect(
      evaluateWarnings(DEFAULT_THRESHOLDS, forecast(gusty), [wp(0, 0)], 0, NOW)
    ).toHaveLength(0)
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
