import { describe, expect, it } from 'vitest'
import {
  buildupIndex,
  droughtCode,
  duffMoistureCode,
  fireDanger,
  fireWeatherIndex,
  fineFuelMoistureCode,
  initialSpreadIndex,
  runFwi,
  FWI_START,
  type FwiInput
} from './fwi'

/**
 * The official reference sequence shipped with the `cffdrs` R package
 * (tests/testthat/data/fwi_01.csv): 48 consecutive days at 40 deg N starting
 * 1985-04-13, with the expected value of every code and index. Columns are
 * [month, temp, rh, wind, rain, FFMC, DMC, DC, ISI, BUI].
 */
const REFERENCE: number[][] = [
  [4, 17.0, 42.0, 25.0, 0.0, 87.65, 8.545, 19.01, 10.78, 8.49],
  [4, 20.0, 21.0, 25.0, 2.4, 86.2, 10.4, 23.57, 8.771, 10.36],
  [4, 8.5, 40.0, 17.0, 0.0, 86.91, 11.8, 26.05, 6.478, 11.74],
  [4, 6.5, 25.0, 6.0, 0.0, 88.76, 13.18, 28.18, 4.851, 13.11],
  [4, 13.0, 34.0, 24.0, 0.0, 89.04, 15.44, 31.47, 12.51, 15.34],
  [4, 6.0, 40.0, 22.0, 0.4, 88.59, 16.47, 33.5, 10.6, 16.37],
  [4, 5.5, 52.0, 6.0, 0.0, 87.28, 17.24, 35.45, 3.923, 17.14],
  [4, 8.5, 46.0, 16.0, 0.0, 87.28, 18.49, 37.93, 6.494, 18.4],
  [4, 9.5, 54.0, 20.0, 0.0, 86.73, 19.68, 40.6, 7.347, 19.58],
  [4, 7.0, 93.0, 14.0, 9.0, 29.83, 10.14, 29.52, 0.006623, 10.91],
  [4, 6.5, 71.0, 17.0, 1.0, 49.4, 10.68, 31.65, 0.3577, 11.59],
  [4, 6.0, 59.0, 17.0, 0.0, 67.22, 11.38, 33.68, 1.346, 12.34],
  [4, 13.0, 52.0, 4.0, 0.0, 77.73, 13.03, 36.98, 1.126, 13.85],
  [4, 15.5, 40.0, 11.0, 0.0, 85.41, 15.44, 40.72, 3.88, 15.85],
  [4, 23.0, 25.0, 9.0, 0.0, 91.46, 19.82, 45.81, 8.306, 19.78],
  [4, 19.0, 46.0, 16.0, 0.0, 89.87, 22.45, 50.19, 9.423, 22.4],
  [4, 18.0, 41.0, 20.0, 0.0, 89.87, 25.19, 54.38, 11.53, 25.11],
  [4, 14.5, 51.0, 16.0, 0.0, 88.36, 27.04, 57.95, 7.581, 26.96],
  [5, 14.5, 69.0, 11.0, 0.0, 85.64, 28.31, 62.96, 4.006, 28.25],
  [5, 15.5, 42.0, 8.0, 0.0, 87.32, 30.85, 68.15, 4.367, 30.78],
  [5, 21.0, 37.0, 8.0, 0.0, 89.33, 34.51, 74.34, 5.822, 34.43],
  [5, 23.0, 32.0, 16.0, 0.0, 90.93, 38.83, 80.88, 10.96, 38.72],
  [5, 23.0, 32.0, 14.0, 0.0, 91.15, 43.14, 87.43, 10.23, 43.01],
  [5, 27.0, 33.0, 12.0, 0.0, 91.61, 48.1, 94.69, 9.862, 47.95],
  [5, 28.0, 17.0, 27.0, 0.0, 95.11, 54.46, 102.13, 34.27, 54.26],
  [5, 23.5, 54.0, 20.0, 0.0, 89.65, 57.43, 108.77, 11.16, 57.24],
  [5, 16.0, 50.0, 22.0, 12.2, 62.2, 29.92, 91.8, 1.405, 32.97],
  [5, 11.0, 58.0, 20.0, 0.0, 76.44, 31.26, 96.19, 2.29, 34.49],
  [5, 16.0, 54.0, 16.0, 0.0, 83.33, 33.33, 101.47, 3.77, 36.6],
  [5, 21.5, 37.0, 9.0, 0.0, 88.6, 37.08, 107.74, 5.515, 39.86],
  [5, 14.0, 61.0, 22.0, 0.2, 86.62, 38.63, 112.67, 7.997, 41.6],
  [5, 15.0, 30.0, 27.0, 0.0, 89.58, 41.6, 117.77, 15.71, 44.18],
  [5, 20.0, 23.0, 11.0, 0.0, 92.07, 45.87, 123.78, 10.01, 47.62],
  [5, 14.0, 95.0, 3.0, 16.4, 21.32, 20.09, 96.89, 0.0002476, 26.46],
  [5, 20.0, 53.0, 4.0, 2.8, 51.0, 18.24, 102.9, 0.2256, 25.27],
  [5, 19.5, 30.0, 16.0, 0.0, 82.21, 22.03, 108.81, 3.273, 29.25],
  [5, 25.5, 51.0, 20.0, 6.0, 75.32, 16.37, 106.33, 2.135, 23.65],
  [5, 10.0, 38.0, 24.0, 0.0, 84.27, 18.19, 110.54, 6.386, 25.77],
  [5, 19.0, 27.0, 16.0, 0.0, 90.25, 22.05, 116.36, 9.946, 29.92],
  [5, 26.0, 46.0, 11.0, 4.2, 77.54, 18.67, 117.65, 1.578, 26.74],
  [5, 30.0, 38.0, 22.0, 0.0, 90.17, 23.75, 125.46, 13.29, 32.24],
  [5, 25.5, 67.0, 19.0, 12.6, 65.28, 13.14, 108.44, 1.389, 20.17],
  [5, 12.0, 53.0, 28.0, 11.8, 55.39, 7.74, 91.58, 1.183, 12.78],
  [5, 21.0, 38.0, 8.0, 0.0, 80.79, 11.35, 97.76, 1.852, 17.59],
  [5, 13.0, 70.0, 20.0, 3.8, 61.7, 8.406, 97.8, 1.238, 13.84],
  [5, 9.0, 78.0, 24.0, 1.4, 64.43, 8.991, 101.82, 1.726, 14.73],
  [5, 11.0, 54.0, 16.0, 0.0, 77.57, 10.46, 106.21, 2.036, 16.78],
  [5, 15.5, 39.0, 9.0, 0.0, 85.37, 13.12, 111.4, 3.486, 20.27]
]

const REFERENCE_DAYS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]

const EXPECTED_FWI = [10.04, 9.22, 7.517, 6.095, 14.73, 13.36, 5.796, 9.502, 10.88, 0.004191, 0.234, 0.9129, 0.8162, 5.474, 12.08, 14.2, 17.5, 13.17, 7.946, 9.006, 12.17, 20.88, 20.94, 21.56, 52.31, 25.72, 3.011, 5.341, 8.786, 12.63, 17.2, 28.66, 21.72, 0.0002689, 0.2378, 6.758, 3.802, 11.21, 17.1, 2.917, 21.91, 1.862, 0.8184, 2.532, 0.8966, 1.941, 2.766, 5.719]

const LAT = 40

/** Day 1 of the reference run starts from the published spring startup values. */
const dayMs = (month: number, day: number) => Date.UTC(1985, month - 1, day)

describe('the code equations, against the published reference sequence', () => {
  it('reproduces FFMC for every day', () => {
    let prev = FWI_START.ffmc
    REFERENCE.forEach(([, temp, rh, ws, prec, ffmc], i) => {
      const got = fineFuelMoistureCode(prev, temp, rh, ws, prec)
      expect(got, `day ${i + 1}`).toBeCloseTo(ffmc, 1)
      prev = ffmc
    })
  })

  it('reproduces DMC for every day', () => {
    let prev = FWI_START.dmc
    REFERENCE.forEach(([mon, temp, rh, , prec, , dmc], i) => {
      const got = duffMoistureCode(prev, temp, rh, prec, LAT, mon)
      expect(got, `day ${i + 1}`).toBeCloseTo(dmc, 1)
      prev = dmc
    })
  })

  it('reproduces DC for every day', () => {
    let prev = FWI_START.dc
    REFERENCE.forEach(([mon, temp, , , prec, , , dc], i) => {
      const got = droughtCode(prev, temp, prec, LAT, mon)
      expect(got, `day ${i + 1}`).toBeCloseTo(dc, 1)
      prev = dc
    })
  })

  it('reproduces ISI from the published FFMC', () => {
    // The reference FFMC is rounded to 2 dp, and ISI is steep in FFMC: +/-0.005
    // of input rounding moves ISI by about +/-0.007, so assert relatively.
    REFERENCE.forEach(([, , , ws, , ffmc, , , isi], i) => {
      const got = initialSpreadIndex(ffmc, ws)
      expect(Math.abs(got - isi) / Math.max(isi, 0.01), `day ${i + 1}`).toBeLessThan(0.01)
    })
  })

  it('reproduces BUI from the published DMC and DC', () => {
    REFERENCE.forEach(([, , , , , , dmc, dc, , bui], i) => {
      expect(buildupIndex(dmc, dc), `day ${i + 1}`).toBeCloseTo(bui, 1)
    })
  })

  it('reproduces FWI from the published ISI and BUI', () => {
    REFERENCE.forEach(([, , , , , , , , isi, bui], i) => {
      expect(fireWeatherIndex(isi, bui), `day ${i + 1}`).toBeCloseTo(EXPECTED_FWI[i], 1)
    })
  })
})

describe('runFwi', () => {
  const series: FwiInput[] = REFERENCE.map(([mon, temp, rh, ws, prec], i) => ({
    t: dayMs(mon, REFERENCE_DAYS[i]),
    tempC: temp,
    rh,
    windKmh: ws,
    precipMm: prec
  }))

  it('tracks the full published run end to end from the startup values', () => {
    const out = runFwi(series, LAT)
    expect(out).toHaveLength(REFERENCE.length)
    // Compounding its own output, so a slightly looser tolerance than the
    // per-day checks above, which are fed the published previous value.
    out.forEach((d, i) => {
      expect(d.ffmc, `ffmc day ${i + 1}`).toBeCloseTo(REFERENCE[i][5], 0)
      expect(d.dmc, `dmc day ${i + 1}`).toBeCloseTo(REFERENCE[i][6], 0)
      expect(d.dc, `dc day ${i + 1}`).toBeCloseTo(REFERENCE[i][7], 0)
      expect(d.fwi, `fwi day ${i + 1}`).toBeCloseTo(EXPECTED_FWI[i], 0)
    })
  })

  it('is a no-op on an empty series', () => {
    expect(runFwi([], LAT)).toEqual([])
  })
})

describe('fireDanger bands', () => {
  it('maps the official class boundaries, upper bound excluded', () => {
    expect(fireDanger(0)).toBe('very low')
    expect(fireDanger(4)).toBe('very low')
    expect(fireDanger(5.2)).toBe('low')
    expect(fireDanger(11.2)).toBe('moderate')
    expect(fireDanger(21.3)).toBe('high')
    expect(fireDanger(38)).toBe('very high')
    expect(fireDanger(50)).toBe('extreme')
    expect(fireDanger(120)).toBe('extreme')
  })

  it('reports the higher class just below an edge', () => {
    // Our FWI scatters by a few points against the reference, so a value this
    // close to an edge is as likely to belong above it; up is the safe way to
    // be wrong about fire.
    expect(fireDanger(5.19)).toBe('low')
    expect(fireDanger(11.0)).toBe('moderate')
    expect(fireDanger(37.9)).toBe('very high')
    expect(fireDanger(49.8)).toBe('extreme')
  })

  it('does not round up from further below an edge', () => {
    expect(fireDanger(4.9)).toBe('very low')
    expect(fireDanger(10.9)).toBe('low')
    expect(fireDanger(37.7)).toBe('high')
  })

  it('never reports past the top class', () => {
    // The margin must not index past the last band.
    expect(fireDanger(49.9)).toBe('extreme')
    expect(fireDanger(1e6)).toBe('extreme')
  })
})
