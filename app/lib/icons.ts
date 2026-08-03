import type { Condition } from './warnings'

/** MET bases that ship _day/_night variants; the rest 404 with a suffix. */
const DAY_VARIANT: Record<string, true> = {
  clearsky: true,
  fair: true,
  partlycloudy: true,
  lightrainshowers: true,
  rainshowers: true,
  heavyrainshowers: true,
  lightsleetshowers: true,
  sleetshowers: true,
  heavysleetshowers: true,
  lightsnowshowers: true,
  snowshowers: true,
  heavysnowshowers: true,
  lightrainshowersandthunder: true,
  rainshowersandthunder: true,
  heavyrainshowersandthunder: true,
  lightssleetshowersandthunder: true,
  sleetshowersandthunder: true,
  heavysleetshowersandthunder: true,
  lightssnowshowersandthunder: true,
  snowshowersandthunder: true,
  heavysnowshowersandthunder: true
}

const WMO_BASE: Record<number, string> = {
  0: 'clearsky',
  1: 'fair',
  2: 'partlycloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'lightrain',
  53: 'lightrain',
  56: 'lightrain',
  61: 'lightrain',
  55: 'rain',
  57: 'rain',
  63: 'rain',
  65: 'heavyrain',
  66: 'heavyrain',
  67: 'heavyrain',
  71: 'lightsnow',
  77: 'lightsnow',
  73: 'snow',
  75: 'heavysnow',
  80: 'lightrainshowers',
  81: 'rainshowers',
  82: 'heavyrainshowers',
  85: 'lightsnowshowers',
  86: 'heavysnowshowers',
  95: 'rainandthunder',
  96: 'heavyrainandthunder',
  99: 'heavyrainandthunder'
}

/**
 * Six repo files carry a doubled `s` while MET's API returns the correct
 * spelling, so an unmapped lookup 404s.
 */
const FILENAME_FIXUP: Record<string, string> = {
  lightsleetshowersandthunder: 'lightssleetshowersandthunder',
  lightsnowshowersandthunder: 'lightssnowshowersandthunder'
}

export function wmoIcon(code: number | null, isDay: boolean): string {
  const base = (code !== null && WMO_BASE[code]) || 'cloudy'
  const suffix = DAY_VARIANT[base] ? (isDay ? '_day' : '_night') : ''
  return `/wx/${base}${suffix}.svg`
}

export function metIcon(symbolCode: string): string {
  const m = /^(.*?)(_(?:day|night|polartwilight))?$/.exec(symbolCode)
  const base = m?.[1] ?? symbolCode
  const suffix = m?.[2] ?? ''
  const fixed = FILENAME_FIXUP[base] ?? base
  if (!KNOWN_BASES[fixed]) return '/wx/cloudy.svg'
  return `/wx/${fixed}${DAY_VARIANT[fixed] ? suffix || '_day' : ''}.svg`
}

/** Cosmetic sun-versus-moon choice only, so a fixed window is deliberate. */
export function isDayHour(ms: number): boolean {
  const h = new Date(ms).getHours()
  return h >= 6 && h < 20
}

export const conditionGlyph: Record<Condition, string> = {
  rain: '🌧',
  hail: '🧊',
  wind: '💨',
  snow: '❄',
  heat: '🌡',
  blizzard: '🌬',
  thunderstorm: '⛈',
  darkness: '🌙'
}

export const conditionLabel: Record<Condition, string> = {
  rain: 'Rain',
  hail: 'Hail',
  wind: 'Heavy wind',
  snow: 'Snow',
  heat: 'Extreme heat',
  blizzard: 'Blizzard',
  thunderstorm: 'Thunderstorm',
  darkness: 'Darkness'
}

/** The 41 base names present in public/wx (83 files incl. day/night variants). */
const KNOWN_BASES: Record<string, true> = {
  clearsky: true,
  cloudy: true,
  fair: true,
  fog: true,
  heavyrain: true,
  heavyrainandthunder: true,
  heavyrainshowers: true,
  heavyrainshowersandthunder: true,
  heavysleet: true,
  heavysleetandthunder: true,
  heavysleetshowers: true,
  heavysleetshowersandthunder: true,
  heavysnow: true,
  heavysnowandthunder: true,
  heavysnowshowers: true,
  heavysnowshowersandthunder: true,
  lightrain: true,
  lightrainandthunder: true,
  lightrainshowers: true,
  lightrainshowersandthunder: true,
  lightsleet: true,
  lightsleetandthunder: true,
  lightsleetshowers: true,
  lightssleetshowersandthunder: true,
  lightsnow: true,
  lightsnowandthunder: true,
  lightsnowshowers: true,
  lightssnowshowersandthunder: true,
  partlycloudy: true,
  rain: true,
  rainandthunder: true,
  rainshowers: true,
  rainshowersandthunder: true,
  sleet: true,
  sleetandthunder: true,
  sleetshowers: true,
  sleetshowersandthunder: true,
  snow: true,
  snowandthunder: true,
  snowshowers: true,
  snowshowersandthunder: true
}
