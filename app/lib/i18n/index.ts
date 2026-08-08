import { set } from '../store'
import type { FireDanger } from '../fwi'
import type { Detail } from '../warnings'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../freshness'
import { de } from './de'
import { en, type MessageKey, type Messages } from './en'
import { fr } from './fr'
import { DEFAULT_LOCALE, type Locale } from './locale'

export * from './locale'
export type { MessageKey } from './en'

const CATALOGUES: Record<Locale, Messages> = { en, de, fr }

export type Vars = Record<string, string | number>

/** Looks up a message and fills its `{placeholders}`. */
export type T = (key: MessageKey, vars?: Vars) => string

/**
 * The one thing a component calls.
 *
 * Returns the key itself if a message is somehow missing, which can only happen
 * if a catalogue is edited around the type system. A visible key is a bug
 * report; an empty string is a blank line on a mountain.
 */
export function translator(locale: Locale): T {
  const messages = CATALOGUES[locale] ?? en
  return (key: MessageKey, vars?: Vars): string => {
    const template = messages[key] ?? en[key] ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in vars ? String(vars[name]) : whole
    )
  }
}

/**
 * Counts that inflect.
 *
 * Only `one` and `other` are carried: English, German and French all collapse
 * to those two for the quantities wanderbar ever prints (minutes, hours, days,
 * warnings). `Intl.PluralRules` still does the choosing, so French's rule that
 * 0 takes the singular is honoured without hard-coding it here.
 */
export function plural(
  t: T,
  locale: Locale,
  base: 'age.minute' | 'age.hour' | 'age.day' | 'notify.lifted',
  n: number
): string {
  const rule = new Intl.PluralRules(locale).select(n)
  const key = (rule === 'one' ? `${base}_one` : `${base}_other`) as MessageKey
  return t(key, { n })
}

/**
 * Locale-aware number formatting.
 *
 * This is why `Warning.detail` had to stop being a baked string: a German
 * reader writes 0,1 mm/h and 1.500 m, and the old code hard-coded a decimal
 * point via `toFixed`. Everything numeric the UI prints goes through here.
 */
export function num(locale: Locale, value: number, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value)
}

export function clockAt(locale: Locale, ms: number): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Renders the measured facts of a warning into the reader's language.
 *
 * The counterpart to `Detail` in ../warnings: evaluation stores values, this
 * turns them into a phrase. Keeping the two apart is what lets a forecast
 * fetched in German be read in French without refetching, and it is why a
 * language switch does not have to invalidate anything already stored.
 */
export function detailText(t: T, locale: Locale, d: Detail): string {
  switch (d.kind) {
    case 'rainRate':
      return t('detail.rainRate', { mm: num(locale, d.mmPerH, 1) })
    case 'hailPossible':
      return t('detail.hailPossible')
    case 'gusts':
      return t('detail.gusts', { kmh: num(locale, Math.round(d.gustKmh)) })
    case 'snowfall':
      return t('detail.snowfall', { cm: num(locale, d.cm, 1) })
    case 'snowExpected':
      return t('detail.snowExpected')
    case 'blizzard':
      return t('detail.blizzard', {
        kmh: num(locale, Math.round(d.gustKmh)),
        temp: num(locale, d.tempC)
      })
    case 'instability':
      return t(`instability.${d.band}` as MessageKey)
    case 'icePrecip':
      return t(`ice.${d.code}` as MessageKey)
    case 'windChill':
      return d.frostbite === null
        ? t('detail.windChill', { temp: num(locale, d.feelsC) })
        : t('detail.windChillFrostbite', {
            temp: num(locale, d.feelsC),
            band: t(`frostbite.${d.frostbite}` as MessageKey)
          })
    case 'lyingSnow':
      return t('detail.lyingSnow', { cm: num(locale, Math.round(d.cm)) })
    case 'heat':
      return t('detail.heat', { temp: num(locale, d.tempC, 1) })
    case 'fire':
      return t('detail.fire', {
        danger: t(`fireDanger.${d.danger}` as MessageKey),
        fwi: num(locale, d.fwi)
      })
    case 'sunrise':
      return t('detail.sunrise', { time: clockAt(locale, d.atMs) })
    case 'beforeSunrise':
      return t('detail.beforeSunrise', { time: clockAt(locale, d.atMs) })
    case 'afterSunset':
      return t('detail.afterSunset', { time: clockAt(locale, d.atMs) })
    case 'dusk':
      return t('detail.dusk', { time: clockAt(locale, d.atMs) })
  }
}

export const fireDangerText = (t: T, d: FireDanger): string =>
  t(`fireDanger.${d}` as MessageKey)

/**
 * Splits a message around a single `{placeholder}` so a component can put a
 * real element where the word goes.
 *
 * Needed because two sentences embed a link to the issuing avalanche service,
 * and the word order around it differs per language: German puts the object
 * before the verb, French needs its own preposition. Interpolating a string
 * would flatten the anchor; appending the link after the sentence would put it
 * in the wrong place in at least one language.
 */
/**
 * Age as a bare duration, in the reader's language.
 *
 * Coarse on purpose: the reader has to decide whether to trust a forecast, and
 * "7 hours" carries that decision where "6 h 51 min" invites arithmetic. Two
 * days are still counted in hours, because "2 days" past midnight reads as a
 * different date rather than a long night.
 */
export function ageText(t: T, locale: Locale, ms: number): string {
  if (ms < MINUTE_MS) return t('age.underMinute')
  if (ms < HOUR_MS) return plural(t, locale, 'age.minute', Math.floor(ms / MINUTE_MS))
  if (ms < 2 * DAY_MS) return plural(t, locale, 'age.hour', Math.floor(ms / HOUR_MS))
  return plural(t, locale, 'age.day', Math.floor(ms / DAY_MS))
}

/**
 * Splits a message into literal chunks and named placeholder slots, so a
 * component can drop real elements in where the words go.
 *
 * The verdict line styles the condition and the time differently and puts them
 * in an order that changes per language, so neither string interpolation nor
 * appending works. Returning the parts lets JSX do the assembling.
 */
export function parts(t: T, key: MessageKey, vars: Vars = {}): (string | { slot: string })[] {
  const out: (string | { slot: string })[] = []
  const template = t(key)
  let last = 0
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const name = m[1]
    if (m.index > last) out.push(template.slice(last, m.index))
    if (name in vars) out.push(String(vars[name]))
    else out.push({ slot: name })
    last = m.index + m[0].length
  }
  if (last < template.length) out.push(template.slice(last))
  return out
}

export function splitAround(t: T, key: MessageKey, name: string): [string, string] {
  const template = t(key)
  const token = `{${name}}`
  const at = template.indexOf(token)
  if (at === -1) return [template, '']
  return [template.slice(0, at), template.slice(at + token.length)]
}

/**
 * The locale an island renders in: whatever the path said.
 *
 * Islands cannot read the request context in HonoX, so the server passes the
 * path-derived locale down as a prop and this simply honours it. It pointedly
 * does NOT fall back to the stored preference: doing that rendered an English
 * document with French islands hydrating over it, so the page and its own
 * <html lang> disagreed. The URL is the single answer to "which language is
 * this", and `LocaleGate` reconciles a stored preference with it by navigating,
 * so the address bar and the words always match.
 *
 * Nothing is written here. Visiting a URL is not choosing a language — a
 * shared `/de` link must not overwrite the French a reader picked — so the
 * store is only ever written by the switcher, which is the one place a reader
 * actually states a preference.
 */
export function useLocale(locale: Locale): [Locale, T] {
  return [locale, translator(locale)]
}

export async function setLocale(locale: Locale): Promise<void> {
  await set('locale', locale)
}
