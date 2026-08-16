import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  diffWarnings,
  evaluateWarnings,
  windChillC,
  type Condition,
  type Thresholds,
  type Warning
} from './warnings'
import { detailText, translator, type MessageKey } from './i18n'
import { LOCALES } from './i18n/locale'
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
  snowDepthM: 0,
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
    const extras = { 0: { thunderByHour: { [NOW]: 40 } } }
    expect(conditions(evaluate(hour(), DEFAULT_THRESHOLDS, extras))).toEqual(['thunderstorm'])
  })

  it('reads MET thunder at the hour walked, not at some other hour', () => {
    // A single figure per waypoint used to be applied to every hour of the
    // track: a morning storm then warned an evening waypoint, and a quiet
    // morning hid an afternoon one.
    const elsewhere = { 0: { thunderByHour: { [NOW - 6 * 3600_000]: 90 } } }
    expect(conditions(evaluate(hour(), DEFAULT_THRESHOLDS, elsewhere))).toEqual([])

    const here = { 0: { thunderByHour: { [NOW - 6 * 3600_000]: 0, [NOW]: 90 } } }
    expect(conditions(evaluate(hour(), DEFAULT_THRESHOLDS, here))).toEqual(['thunderstorm'])
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

describe('warning detail copy', () => {
  // The UI renders "Label (detail)", so a detail that restates its own label
  // produces "Rain (2.4 mm/h rain)" or "Thunderstorm (thunderstorm)".
  const everyCondition: Condition[] = [
    'rain',
    'hail',
    'wind',
    'snow',
    'heat',
    'blizzard',
    'thunderstorm',
    'darkness',
    'fire',
    'ice',
    'coldwind',
    'deepsnow'
  ]

  it('never repeats the condition label inside the detail', () => {
    const extreme = hour({
      tempC: 34,
      apparentC: 34,
      precipMm: 9,
      precipProb: 95,
      snowfallCm: 4,
      windKmh: 80,
      gustKmh: 95,
      code: 96,
      capeJkg: 1680
    })
    const date = new Date(NOW).toISOString().slice(0, 10)
    const got = evaluateWarnings(
      DEFAULT_THRESHOLDS,
      [{ seq: 0, hours: [extreme], sun: [{ sunriseMs: NOW + 6 * 3600_000, sunsetMs: NOW + 12 * 3600_000 }] }],
      [wp(0, 0)],
      0,
      NOW,
      {},
      { [date]: 44 }
    )
    expect(got.length).toBeGreaterThan(4)
    const t = translator('en')
    for (const w of got) {
      // The rendered phrase is what a reader sees, so the rule is checked there
      // rather than on the structured detail behind it.
      const text = detailText(t, 'en', w.detail)
      const label = t(`condition.${w.condition}` as MessageKey).toLowerCase()
      expect(text.toLowerCase(), `${w.condition}: "${text}"`).not.toContain(label)
      // Nor a bare noun the label already implies.
      for (const word of label.split(' ')) {
        expect(text.toLowerCase(), `${w.condition}: "${text}"`).not.toContain(word)
      }
      expect(text, `${w.condition} has nested parens`).not.toMatch(/\(/)
      expect(text.length, `${w.condition} detail empty`).toBeGreaterThan(0)
    }
  })

  it('describes thunderstorm strength in bands, not raw CAPE joules', () => {
    const run = (capeJkg: number | null) => {
      const d = evaluateWarnings(
        DEFAULT_THRESHOLDS,
        forecast(hour({ code: 95, capeJkg })),
        [wp(0, 0)],
        0,
        NOW
      ).find((w) => w.condition === 'thunderstorm')!.detail
      expect(d.kind).toBe('instability')
      return d.kind === 'instability' ? d.band : null
    }
    expect(run(1680)).toBe('strong')
    expect(run(3200)).toBe('violent')
    expect(run(500)).toBe('weak')
    expect(run(100)).toBe('expected')
    expect(run(null)).toBe('expected')
    // The raw joules must never reach the reader, in any language.
    expect(detailText(translator('en'), 'en', { kind: 'instability', band: 'strong' })).not.toContain(
      '1680'
    )
  })

  it('covers every condition with a label in every language', () => {
    for (const locale of LOCALES) {
      const t = translator(locale)
      for (const c of everyCondition) {
        expect(t(`condition.${c}` as MessageKey), `${locale}/${c}`).toBeTruthy()
      }
    }
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
    expect(got[0].detail).toEqual({ kind: 'fire', danger: 'high', fwi: 30 })
  })

  it('respects a stricter threshold', () => {
    expect(run(30, 'extreme')).toHaveLength(0)
    expect(run(60, 'extreme')[0].detail).toMatchObject({ danger: 'extreme' })
  })

  it('respects a looser threshold', () => {
    expect(run(15, 'moderate')[0].detail).toMatchObject({ danger: 'moderate' })
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

  it('warns well after sunset, naming when light returns', () => {
    const got = at(NOW + 5 * 3600_000)
    expect(got).toHaveLength(1)
    // The label already says "Darkness"; the detail carries the useful fact.
    expect(got[0].detail.kind).toBe('sunrise')
  })

  it('warns before sunrise', () => {
    expect(at(NOW - 5 * 3600_000)[0].detail.kind).toBe('sunrise')
  })

  it('flags the dusk window, which catches people out on a descent', () => {
    expect(at(NOW + 2 * 3600_000 - 10 * 60_000)[0].detail.kind).toBe('dusk')
  })

  it('flags the hour just after sunset separately from full dark', () => {
    expect(at(NOW + 2 * 3600_000 + 10 * 60_000)[0].detail.kind).toBe('afterSunset')
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
    expect(got[0].detail).toEqual({ kind: 'heat', tempC: 34 })
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

describe('warning provenance', () => {
  const sourceOf = (ws: Warning[], c: Condition) => ws.find((w) => w.condition === c)?.source

  it('credits Open-Meteo when only its weather code says thunder', () => {
    expect(sourceOf(evaluate(hour({ code: 95 })), 'thunderstorm')).toBe('open-meteo')
  })

  it('credits MET when only its thunder probability says so', () => {
    // Open-Meteo's code 1 is a clear sky: without MET there is no warning here,
    // so attributing this one to Open-Meteo would be a lie the user could act on.
    const ws = evaluate(hour({ code: 1 }), DEFAULT_THRESHOLDS, {
      0: { thunderByHour: { [NOW]: 60 } }
    })
    expect(sourceOf(ws, 'thunderstorm')).toBe('met')
  })

  it('credits both when both raise the same storm', () => {
    const ws = evaluate(hour({ code: 95 }), DEFAULT_THRESHOLDS, {
      0: { thunderByHour: { [NOW]: 60 } }
    })
    expect(sourceOf(ws, 'thunderstorm')).toBe('open-meteo+met')
  })

  it('marks fire danger as computed, because no provider forecasts it', () => {
    const day = new Date(NOW).toISOString().slice(0, 10)
    const ws = evaluateWarnings(
      DEFAULT_THRESHOLDS,
      forecast(hour()),
      [wp(0, 0)],
      0,
      NOW,
      {},
      { [day]: 40 }
    )
    expect(sourceOf(ws, 'fire')).toBe('computed')
  })

  it('credits Open-Meteo for the ordinary hourly variables', () => {
    expect(sourceOf(evaluate(hour({ precipMm: 9 })), 'rain')).toBe('open-meteo')
    expect(sourceOf(evaluate(hour({ gustKmh: 90 })), 'wind')).toBe('open-meteo')
  })
})

describe('the warning baseline', () => {
  const w = (seq: number, condition: Condition): Warning => ({
    seq,
    condition,
    forecastHour: NOW,
    detail: { kind: 'hailPossible' },
    source: 'open-meteo'
  })

  it('treats an empty previous set as all-new, so a reset re-announces', () => {
    // clearTrack() nulls the forecast, so the next sync sees prev = [].
    // Everything genuinely dangerous on the new track must be reported.
    const d = diffWarnings([], [w(1, 'rain'), w(4, 'thunderstorm')])
    expect(d.worsened).toHaveLength(2)
    expect(d.cleared).toHaveLength(0)
  })

  it('never reports the old track\'s warnings as cleared after a reset', () => {
    // The danger of NOT resetting: warnings from a previous hike would show up
    // as "cleared" on an unrelated track.
    const oldTrack = [w(9, 'wind'), w(12, 'snow')]
    expect(diffWarnings([], oldTrack).cleared).toHaveLength(0)
  })
})

describe('diffWarnings', () => {
  const w = (seq: number, condition: Condition, forecastHour = NOW): Warning => ({
    seq,
    condition,
    forecastHour,
    detail: { kind: 'hailPossible' },
    source: 'open-meteo'
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

  it('stays silent when only the source changes', () => {
    // A thunderstorm both providers agree on, then only MET still calls it, is
    // the same storm. Keying the diff on source would buzz the lock screen every
    // time the two models drifted apart, which is exactly the noise the diff
    // exists to prevent.
    const prev: Warning[] = [{ ...w(3, 'thunderstorm'), source: 'open-meteo+met' }]
    const next: Warning[] = [{ ...w(3, 'thunderstorm'), source: 'met' }]
    expect(diffWarnings(prev, next)).toEqual({ worsened: [], cleared: [] })
  })
})

describe('winter hiking', () => {
  describe('windChillC', () => {
    // Environment Canada's own worked example: -20 C with 30 km/h reads -33.
    it('matches the published JAG/TI value', () => {
      expect(windChillC(-20, 30)!).toBeCloseTo(-32.6, 1)
      expect(windChillC(0, 30)!).toBeCloseTo(-6.5, 1)
    })

    it('refuses to extrapolate outside the model range', () => {
      // Above 10 C there is no chill, and at or below 4.8 km/h the air is calm.
      expect(windChillC(11, 30)).toBeNull()
      expect(windChillC(-20, 4.8)).toBeNull()
      expect(windChillC(-20, null)).toBeNull()
      expect(windChillC(null, 30)).toBeNull()
    })

    it('gets colder as wind rises at fixed temperature', () => {
      expect(windChillC(-10, 40)!).toBeLessThan(windChillC(-10, 10)!)
    })
  })

  it('warns on freezing rain, which is neither rain nor snow', () => {
    // The whole point: codes 56/57/66/67 sit in no other code table, so before
    // 'ice' existed a glazed trail produced an empty timeline row.
    for (const code of [56, 57, 66, 67]) {
      expect(conditions(evaluate(hour({ code }))), `code ${code}`).toContain('ice')
    }
    expect(conditions(evaluate(hour({ code: 61 })))).not.toContain('ice')
  })

  it('names which kind of freezing precipitation it is', () => {
    const detail = (code: number) =>
      evaluate(hour({ code })).find((w) => w.condition === 'ice')!.detail
    expect(detail(56)).toEqual({ kind: 'icePrecip', code: 56 })
    expect(detail(67)).toEqual({ kind: 'icePrecip', code: 67 })
    // The code must reach the reader as words, not as a number.
    const t = translator('en')
    expect(detailText(t, 'en', detail(56))).toBe('freezing drizzle')
    expect(detailText(t, 'en', detail(67))).toBe('heavy freezing rain')
  })

  it('applies the wind chill threshold at the boundary', () => {
    // -13.6 C with 25 km/h chills to about -22.6.
    const h = hour({ tempC: -13.6, windKmh: 25 })
    expect(conditions(evaluate(h, thresholds({ windChillC: -20 })))).toContain('coldwind')
    expect(conditions(evaluate(h, thresholds({ windChillC: -30 })))).not.toContain('coldwind')
  })

  it('does not raise wind chill on a calm cold day', () => {
    // Calm air is outside the model, and a still -20 C is a normal winter day.
    expect(conditions(evaluate(hour({ tempC: -20, windKmh: 0 })))).not.toContain('coldwind')
  })

  it('names the frostbite time only once it is short enough to matter', () => {
    const detail = (tempC: number, windKmh: number) =>
      evaluate(hour({ tempC, windKmh }), thresholds({ windChillC: -5 })).find(
        (w) => w.condition === 'coldwind'
      )!.detail
    expect(detail(-30, 40)).toMatchObject({ frostbite: '5to10' })
    expect(detail(-10, 20)).toMatchObject({ frostbite: null })
    expect(detailText(translator('en'), 'en', detail(-30, 40))).toContain('frostbite 5-10 min')
  })

  it('warns on lying snow, independently of whether it is falling', () => {
    // Deep snow is a hazard on a bluebird day: the sky says nothing about it.
    const deep = hour({ snowDepthM: 0.8, snowfallCm: 0, code: 0 })
    const got = conditions(evaluate(deep))
    expect(got).toContain('deepsnow')
    expect(got).not.toContain('snow')
  })

  it('applies the lying snow threshold at the boundary', () => {
    expect(conditions(evaluate(hour({ snowDepthM: 0.3 })))).toContain('deepsnow')
    expect(conditions(evaluate(hour({ snowDepthM: 0.29 })))).not.toContain('deepsnow')
  })

  it('reports lying snow in centimetres, which is how it is spoken about', () => {
    const w = evaluate(hour({ snowDepthM: 0.85 })).find((x) => x.condition === 'deepsnow')!
    expect(w.detail).toEqual({ kind: 'lyingSnow', cm: 85 })
  })

  it('leaves every winter condition individually switchable', () => {
    for (const c of ['ice', 'coldwind', 'deepsnow'] as Condition[]) {
      const t = thresholds({ enabled: { ...DEFAULT_THRESHOLDS.enabled, [c]: false } })
      const h = hour({ code: 66, tempC: -25, windKmh: 40, snowDepthM: 1.2 })
      expect(conditions(evaluate(h, t)), c).not.toContain(c)
    }
  })

  it('treats a missing snow depth as unknown rather than zero', () => {
    expect(conditions(evaluate(hour({ snowDepthM: null })))).not.toContain('deepsnow')
  })
})
