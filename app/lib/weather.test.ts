import { describe, expect, it } from 'vitest'
import { reduceToNoonInputs, solarNoonUtcHour, type OpenMeteoHourly } from './weather'

/**
 * Builds an hourly UTC series starting at `start`T00:00, with per-hour values
 * produced by the supplied functions so a test can shape one variable at a time.
 */
function hourly(
  start: string,
  hours: number,
  f: (i: number) => Partial<Record<string, number | null>> = () => ({})
): OpenMeteoHourly {
  const time: string[] = []
  const temperature_2m: (number | null)[] = []
  const relative_humidity_2m: (number | null)[] = []
  const wind_speed_10m: (number | null)[] = []
  const precipitation: (number | null)[] = []
  const t0 = Date.parse(`${start}T00:00:00Z`)
  for (let i = 0; i < hours; i++) {
    const v = f(i)
    time.push(new Date(t0 + i * 3600_000).toISOString().slice(0, 16))
    temperature_2m.push(v.temperature_2m === undefined ? 20 : v.temperature_2m)
    relative_humidity_2m.push(v.relative_humidity_2m === undefined ? 40 : v.relative_humidity_2m)
    wind_speed_10m.push(v.wind_speed_10m === undefined ? 10 : v.wind_speed_10m)
    precipitation.push(v.precipitation === undefined ? 0 : v.precipitation)
  }
  return { time, temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation }
}

describe('solarNoonUtcHour', () => {
  it('is noon UTC on the prime meridian', () => {
    expect(solarNoonUtcHour(0)).toBe(12)
  })

  it('moves one hour earlier per 15 degrees east', () => {
    expect(solarNoonUtcHour(15)).toBe(11)
    expect(solarNoonUtcHour(23.73)).toBe(10)
    expect(solarNoonUtcHour(-15)).toBe(13)
  })

  it('wraps into 0..23 past the date line', () => {
    expect(solarNoonUtcHour(-170)).toBe(23)
    // Either side of the date line solar noon rounds past midnight onto hour 0.
    expect(solarNoonUtcHour(179)).toBe(0)
    expect(solarNoonUtcHour(-179)).toBe(0)
    for (let lon = -180; lon <= 180; lon += 0.5) {
      const h = solarNoonUtcHour(lon)
      expect(Number.isInteger(h) && h >= 0 && h < 24).toBe(true)
    }
  })
})

describe('reduceToNoonInputs', () => {
  it('samples temperature, humidity and wind at local solar noon', () => {
    // Longitude 0 puts solar noon at 12:00 UTC; hour i carries value i so the
    // sampled hour is identifiable from the output alone.
    const h = hourly('2026-06-01', 72, (i) => ({
      temperature_2m: i,
      relative_humidity_2m: i,
      wind_speed_10m: i
    }))
    const [day] = reduceToNoonInputs(h, 0).slice(-1)
    // The last full window ends at hour 60, which is 12:00 on the third day.
    expect(day.tempC).toBe(60)
    expect(day.rh).toBe(60)
    expect(day.windKmh).toBe(60)
  })

  it('samples the shifted hour for an eastern longitude', () => {
    const h = hourly('2026-06-01', 48, (i) => ({ temperature_2m: i }))
    // Solar noon at 23.73E is 10:00 UTC, so the day-2 sample is hour 34.
    const rows = reduceToNoonInputs(h, 23.73)
    expect(rows).toHaveLength(1)
    expect(rows[0].tempC).toBe(34)
  })

  it('stamps each row with the UTC date of the sampled noon', () => {
    const rows = reduceToNoonInputs(hourly('2026-06-01', 72), 0)
    expect(rows.map((r) => new Date(r.t).toISOString().slice(0, 10))).toEqual([
      '2026-06-02',
      '2026-06-03'
    ])
  })

  it('accumulates rain over the 24 hours ending at noon, not the calendar day', () => {
    // 1 mm in the hour after noon on day 1 belongs to day 2's window.
    const h = hourly('2026-06-01', 72, (i) => ({ precipitation: i === 13 ? 1 : 0 }))
    const rows = reduceToNoonInputs(h, 0)
    expect(rows[0].precipMm).toBe(1)
    expect(rows[1].precipMm).toBe(0)
  })

  it('counts the noon hour itself in the window it closes', () => {
    const h = hourly('2026-06-01', 72, (i) => ({ precipitation: i === 36 ? 2 : 0 }))
    const rows = reduceToNoonInputs(h, 0)
    expect(rows[0].precipMm).toBe(2)
    expect(rows[1].precipMm).toBe(0)
  })

  it('skips a leading day whose 24 h rain window is truncated', () => {
    // The series starts at 00:00, so the first noon has only 13 hours behind it
    // and would understate rain; it is dropped rather than emitted.
    const rows = reduceToNoonInputs(hourly('2026-06-01', 48), 0)
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0].t).toISOString().slice(0, 10)).toBe('2026-06-02')
  })

  it('stops at a mid-series gap rather than carrying a corrupt code forward', () => {
    const h = hourly('2026-06-01', 96, (i) => ({
      temperature_2m: i === 60 ? null : 20
    }))
    const rows = reduceToNoonInputs(h, 0)
    expect(rows.map((r) => new Date(r.t).toISOString().slice(0, 10))).toEqual(['2026-06-02'])
  })

  it('stops when a gap falls inside a rain window, not just on the sample', () => {
    const h = hourly('2026-06-01', 96, (i) => ({ precipitation: i === 50 ? null : 0 }))
    const rows = reduceToNoonInputs(h, 0)
    expect(rows.map((r) => new Date(r.t).toISOString().slice(0, 10))).toEqual(['2026-06-02'])
  })

  it('yields nothing when the series opens with a long run of gaps', () => {
    // Open-Meteo does this past roughly past_days=60: it starts the series with
    // hundreds of empty hours rather than refusing. Emitting partial days from
    // the tail would hand the codes a series with no spin-up, so nothing is
    // returned and the caller keeps the previous reading.
    const h = hourly('2026-06-01', 96, (i) =>
      i < 72 ? { temperature_2m: null, relative_humidity_2m: null, wind_speed_10m: null } : {}
    )
    expect(reduceToNoonInputs(h, 0)).toEqual([])
  })

  it('returns nothing for an empty series', () => {
    expect(reduceToNoonInputs({}, 0)).toEqual([])
  })
})
