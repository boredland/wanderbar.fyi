/**
 * Which language wanderbar speaks, and where that answer lives.
 *
 * In IndexedDB rather than in a URL segment alone, because three consumers need
 * it and only one of them is a page: the islands render from it, and the service
 * worker reads it with no DOM at all when it builds a lock-screen notification
 * from a background push. A URL cannot reach that last one, and `navigator.
 * language` is the device's answer rather than the reader's choice.
 *
 * The path still decides what the server renders (see routes/_middleware.ts):
 * the URL is what a crawler, a share and a bookmark carry. The stored value is
 * what the app remembers, and a visit to a locale path updates it.
 */
export const LOCALES = ['en', 'de', 'fr'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Names are given in their own language: nobody looks for "German". */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français'
}

/**
 * Whether a common noun is written lowercase in the middle of a sentence.
 *
 * German capitalises every noun, so the verdict line must read "dann Regen"
 * and not "dann regen" — the latter is a different word entirely. English and
 * French lowercase, which is why the condition label cannot simply be passed
 * through `toLowerCase()` for everyone the way it was when this app spoke one
 * language.
 */
export const LOWERCASES_NOUNS: Record<Locale, boolean> = { en: true, de: false, fr: true }

export function isLocale(v: string | null | undefined): v is Locale {
  return v === 'en' || v === 'de' || v === 'fr'
}

/**
 * Picks a locale from an `Accept-Language` header, else English.
 *
 * Deliberately tolerant of subtags: `de-AT` and `de-CH` are the two most likely
 * headers on an alpine hike, and neither should fall back to English. Quality
 * values are honoured because a browser configured `fr;q=0.9, en;q=0.8` is
 * stating a preference order, not listing what it can tolerate.
 */
export function localeFromHeader(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      return { tag: tag.trim().toLowerCase(), q: q ? Number.parseFloat(q.split('=')[1]) : 1 }
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    const base = tag.split('-')[0]
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}

/**
 * The path prefix for a locale. English is unprefixed: it was the only language
 * for the app's whole life so far, and moving it to /en would break every link
 * already shared.
 */
export function localePath(locale: Locale, path = '/'): string {
  const rest = path === '/' ? '' : path
  return locale === DEFAULT_LOCALE ? `/${rest.replace(/^\//, '')}` : `/${locale}${rest}`
}
