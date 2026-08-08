import { setLocale, useLocale } from '../lib/i18n'
import { LOCALES, LOCALE_LABEL, localePath, type Locale } from '../lib/i18n/locale'

/**
 * The language control.
 *
 * Navigates rather than swapping strings in place. The URL is the shareable,
 * crawlable answer to "which language is this", and a switcher that changed the
 * text while leaving the address bar on the English page would make the two
 * disagree. It also stores the choice, so the service worker's notifications
 * and any later visit to `/` follow the same language without asking again.
 *
 * A plain <select> rather than a row of flags: flags are countries, not
 * languages, and Deutsch is not the German flag to an Austrian or a Swiss
 * reader — which is most of this app's audience.
 */
export default function LanguageSwitcher(props: { locale: Locale }) {
  const [locale, t] = useLocale(props.locale)
  const label = t('lang.label')

  return (
    <select
      class="field text-xs"
      aria-label={label}
      value={locale}
      onChange={async (e) => {
        const next = (e.target as HTMLSelectElement).value as Locale
        // Stored before navigating, so the destination renders in the chosen
        // language even though the island there starts from its path prop.
        await setLocale(next)
        location.assign(localePath(next))
      }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l} selected={l === locale}>
          {LOCALE_LABEL[l]}
        </option>
      ))}
    </select>
  )
}
