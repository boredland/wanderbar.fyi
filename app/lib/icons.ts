
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

export function wmoIcon(code: number | null, isDay: boolean): string {
  const base = (code !== null && WMO_BASE[code]) || 'cloudy'
  const suffix = DAY_VARIANT[base] ? (isDay ? '_day' : '_night') : ''
  return `/wx/${base}${suffix}.svg`
}

/** Cosmetic sun-versus-moon choice only, so a fixed window is deliberate. */
export function isDayHour(ms: number): boolean {
  const h = new Date(ms).getHours()
  return h >= 6 && h < 20
}

