/**
 * The Canadian Forest Fire Weather Index System.
 *
 * Transcribed from the reference implementation in the `cffdrs` R package
 * (Natural Resources Canada), which itself implements Van Wagner & Pickett
 * 1985, Forestry Technical Report 33. The equations and constants below are
 * that standard, not an approximation of it: do not tune them.
 *
 * Inputs are noon-ish daily values: temperature °C, relative humidity %,
 * wind speed km/h, and rainfall mm over 24 h.
 */

export type FwiCodes = { ffmc: number; dmc: number; dc: number }
export type FwiDay = FwiCodes & { isi: number; bui: number; fwi: number }

/** Standard spring startup values (Van Wagner & Pickett). */
export const FWI_START: FwiCodes = { ffmc: 85, dmc: 6, dc: 15 }

const FFMC_COEFFICIENT = (250.0 * 59.5) / 101.0

/** Day-length factors for DMC, by month, 30–90°N. */
const DMC_DAY_LENGTH = [6.5, 7.5, 9, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8, 7, 6]
/** Equatorial band uses a flat factor. */
const DMC_DAY_LENGTH_EQ = 9
const DMC_DAY_LENGTH_10_30N = [7.9, 8.4, 8.9, 9.5, 9.9, 10.2, 10.1, 9.7, 9.1, 8.6, 8.1, 7.8]
const DMC_DAY_LENGTH_10_30S = [10.1, 9.6, 9.1, 8.5, 8.1, 7.8, 7.9, 8.3, 8.9, 9.4, 9.9, 10.2]
const DMC_DAY_LENGTH_S = [11.5, 10.5, 9.2, 7.9, 6.8, 6.2, 6.5, 7.4, 8.7, 10, 11.2, 11.8]

/** Day-length adjustment for DC, by month, northern hemisphere. */
const DC_DAY_LENGTH_N = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5, 2.4, 0.4, -1.6, -1.6]
const DC_DAY_LENGTH_S = [6.4, 5, 2.4, 0.4, -1.6, -1.6, -1.6, -1.6, -1.6, 0.9, 3.8, 5.8]

function dmcDayLength(lat: number, month: number): number {
  const i = month - 1
  if (lat > 30) return DMC_DAY_LENGTH[i]
  if (lat <= 30 && lat > 10) return DMC_DAY_LENGTH_10_30N[i]
  if (lat <= 10 && lat > -10) return DMC_DAY_LENGTH_EQ
  if (lat <= -10 && lat > -30) return DMC_DAY_LENGTH_10_30S[i]
  return DMC_DAY_LENGTH_S[i]
}

/** Fine Fuel Moisture Code: litter dryness, responds within hours. */
export function fineFuelMoistureCode(
  prev: number,
  temp: number,
  rh: number,
  ws: number,
  prec: number
): number {
  let wmo = (FFMC_COEFFICIENT * (101 - prev)) / (59.5 + prev)

  if (prec > 0.5) {
    const ra = prec - 0.5
    const soak = 42.5 * ra * Math.exp(-100 / (251 - wmo)) * (1 - Math.exp(-6.93 / ra))
    wmo = wmo > 150 ? wmo + 0.0015 * (wmo - 150) ** 2 * Math.sqrt(ra) + soak : wmo + soak
  }
  if (wmo > 250) wmo = 250

  const humid = 0.18 * (21.1 - temp) * (1 - 1 / Math.exp(rh * 0.115))
  const ed = 0.942 * rh ** 0.679 + 11 * Math.exp((rh - 100) / 10) + humid
  const ew = 0.618 * rh ** 0.753 + 10 * Math.exp((rh - 100) / 10) + humid

  let wm = wmo
  if (wmo < ed && wmo < ew) {
    const z =
      0.424 * (1 - ((100 - rh) / 100) ** 1.7) +
      0.0694 * Math.sqrt(ws) * (1 - ((100 - rh) / 100) ** 8)
    const x = z * 0.581 * Math.exp(0.0365 * temp)
    wm = ew - (ew - wmo) / 10 ** x
  } else if (wmo > ed) {
    const z = 0.424 * (1 - (rh / 100) ** 1.7) + 0.0694 * Math.sqrt(ws) * (1 - (rh / 100) ** 8)
    const x = z * 0.581 * Math.exp(0.0365 * temp)
    wm = ed + (wmo - ed) / 10 ** x
  }

  return Math.min(101, Math.max(0, (59.5 * (250 - wm)) / (FFMC_COEFFICIENT + wm)))
}

/** Duff Moisture Code: loosely compacted organic layers, responds over days. */
export function duffMoistureCode(
  prev: number,
  temp: number,
  rh: number,
  prec: number,
  lat: number,
  month: number
): number {
  const t = Math.max(temp, -1.1)
  const rk = 1.894 * (t + 1.1) * (100 - rh) * dmcDayLength(lat, month) * 1e-4

  let pr = prev
  if (prec > 1.5) {
    const rw = 0.92 * prec - 1.27
    const wmi = 20 + 280 / Math.exp(0.023 * prev)
    const b =
      prev <= 33
        ? 100 / (0.5 + 0.3 * prev)
        : prev <= 65
          ? 14 - 1.3 * Math.log(prev)
          : 6.2 * Math.log(prev) - 17.2
    const wmr = wmi + (1000 * rw) / (48.77 + b * rw)
    pr = 43.43 * (5.6348 - Math.log(wmr - 20))
  }
  return Math.max(0, Math.max(0, pr) + rk)
}

/** Drought Code: deep compact organic matter, the season's moisture memory. */
export function droughtCode(
  prev: number,
  temp: number,
  prec: number,
  lat: number,
  month: number
): number {
  const t = Math.max(temp, -2.8)
  const factor =
    lat <= -20 ? DC_DAY_LENGTH_S[month - 1] : lat > -20 && lat <= 20 ? 1.4 : DC_DAY_LENGTH_N[month - 1]
  const pe = Math.max(0, (0.36 * (t + 2.8) + factor) / 2)

  let dr = prev
  if (prec > 2.8) {
    const rw = 0.83 * prec - 1.27
    const smi = 800 * Math.exp(-prev / 400)
    dr = Math.max(0, prev - 400 * Math.log(1 + (3.937 * rw) / smi))
  }
  return Math.max(0, dr + pe)
}

/** Initial Spread Index: expected rate of fire spread. */
export function initialSpreadIndex(ffmc: number, ws: number): number {
  const fm = (FFMC_COEFFICIENT * (101 - ffmc)) / (59.5 + ffmc)
  const fW = Math.exp(0.05039 * ws)
  const fF = 91.9 * Math.exp(-0.1386 * fm) * (1 + fm ** 5.31 / 49_300_000)
  return 0.208 * fW * fF
}

/** Buildup Index: total fuel available to the fire. */
export function buildupIndex(dmc: number, dc: number): number {
  if (dmc === 0 && dc === 0) return 0
  const bui = (0.8 * dc * dmc) / (dmc + 0.4 * dc)
  if (bui >= dmc) return bui
  const p = dmc === 0 ? 0 : (dmc - bui) / dmc
  const cc = 0.92 + (0.0114 * dmc) ** 1.7
  return Math.max(0, dmc - cc * p)
}

/** Fire Weather Index: frontal fire intensity, combining spread and fuel. */
export function fireWeatherIndex(isi: number, bui: number): number {
  const bb =
    bui > 80
      ? 0.1 * isi * (1000 / (25 + 108.64 / Math.exp(0.023 * bui)))
      : 0.1 * isi * (0.626 * bui ** 0.809 + 2)
  return bb <= 1 ? bb : Math.exp(2.72 * (0.434 * Math.log(bb)) ** 0.647)
}

export type FwiInput = {
  /** Epoch ms of the local day. */
  t: number
  tempC: number
  rh: number
  windKmh: number
  precipMm: number
}

/** Advances the codes by one day and derives the indices. */
export function stepFwi(prev: FwiCodes, day: FwiInput, lat: number): FwiDay {
  const month = new Date(day.t).getUTCMonth() + 1
  const ffmc = fineFuelMoistureCode(prev.ffmc, day.tempC, day.rh, day.windKmh, day.precipMm)
  const dmc = duffMoistureCode(prev.dmc, day.tempC, day.rh, day.precipMm, lat, month)
  const dc = droughtCode(prev.dc, day.tempC, day.precipMm, lat, month)
  const isi = initialSpreadIndex(ffmc, day.windKmh)
  const bui = buildupIndex(dmc, dc)
  return { ffmc, dmc, dc, isi, bui, fwi: fireWeatherIndex(isi, bui) }
}

/**
 * Runs the system over a chronological series, returning one result per day.
 *
 * The published system starts from overwintered codes. We cold-start from the
 * standard spring values and spin up over the supplied history, so the earliest
 * days carry initial-value error: FFMC and DMC converge within days, DC (the
 * deepest drought memory) takes longest. Feed it as much history as available.
 */
export function runFwi(days: FwiInput[], lat: number, start: FwiCodes = FWI_START): FwiDay[] {
  let codes = start
  const out: FwiDay[] = []
  for (const day of days) {
    const next = stepFwi(codes, day, lat)
    codes = { ffmc: next.ffmc, dmc: next.dmc, dc: next.dc }
    out.push(next)
  }
  return out
}

/** Official danger classes; upper bound excluded. */
export type FireDanger = 'very low' | 'low' | 'moderate' | 'high' | 'very high' | 'extreme'

const DANGER_BANDS: { max: number; danger: FireDanger }[] = [
  { max: 5.2, danger: 'very low' },
  { max: 11.2, danger: 'low' },
  { max: 21.3, danger: 'moderate' },
  { max: 38.0, danger: 'high' },
  { max: 50.0, danger: 'very high' },
  { max: Infinity, danger: 'extreme' }
]

export function fireDanger(fwi: number): FireDanger {
  for (const band of DANGER_BANDS) if (fwi < band.max) return band.danger
  return 'extreme'
}

export const DANGER_ORDER: Record<FireDanger, number> = {
  'very low': 0,
  low: 1,
  moderate: 2,
  high: 3,
  'very high': 4,
  extreme: 5
}
