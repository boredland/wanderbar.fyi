import { HideButton, useHidden } from '../lib/dismiss'
import { useLocale } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'

/**
 * The best-effort caveat, above the forecast.
 *
 * An island only so it can be dismissed. It is the frame the whole page is
 * read through, so it is stated once and stated first; hiding it is the
 * reader's choice on their own device, not something the page decides.
 */
export default function BestEffort(props: { locale: Locale }) {
  const [hidden, hide] = useHidden('best-effort')
  const [, t] = useLocale(props.locale)
  if (hidden) return null

  return (
    <p class="notice notice-high text-sm">
      <HideButton onHide={hide} label={t('bestEffort.hide')} />
      <span>
        <strong class="font-medium text-ink">{t('bestEffort.lead')}</strong> {t('bestEffort.body')}
      </span>
    </p>
  )
}
