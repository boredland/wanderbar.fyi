import type { Bulletin, DangerLevel } from '../lib/avalanche'
import { HideButton, useHidden } from '../lib/dismiss'
import { splitAround, useLocale, type MessageKey } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'

/**
 * The avalanche bulletin, deliberately its own panel rather than a row in the
 * timeline.
 *
 * Everything else on this page is a forecast wanderbar evaluated, where nothing
 * shown means nothing expected. This panel is a relay of somebody else's
 * official document, and the honest answer is very often "we do not know". A
 * timeline row cannot say that: an empty timeline reads as the green all-clear
 * verdict, which on a loaded slope is the most dangerous sentence this app
 * could print. So every state below says what is and is not known, in words.
 *
 * It never claims a route is safe, only ever what the bulletin says, and always
 * points at the real bulletin, which is the document that actually governs the
 * decision.
 */
export default function AvalanchePanel(props: { bulletin: Bulletin | null; locale: Locale }) {
  const b = props.bulletin
  /*
   * Hooks run before the early returns, because hook order must not depend on
   * whether a bulletin has arrived yet.
   */
  const [hidden, hide] = useHidden('avalanche-unknown')
  const [, t] = useLocale(props.locale)
  if (!b) return null

  const [checkBefore, checkAfter] = splitAround(t, 'avalanche.checkYourself', 'link')
  const [readBefore, readAfter] = splitAround(t, 'avalanche.readBefore', 'link')

  const link = b.providerUrl ? (
    <a class="underline" href={b.providerUrl} target="_blank" rel="noopener noreferrer">
      {b.provider || t('avalanche.theOfficialBulletin')}
    </a>
  ) : null

  if (b.status !== 'ok') {
    /*
     * Only the "we do not know" states can be hidden, and only because they
     * are unactionable by design: they say the same thing every sync until the
     * season or the coverage changes. A real danger level is never given the
     * control, so no reader can dismiss a 4 and have it stay dismissed.
     */
    if (hidden) return null
    return (
      <section class="notice notice-quiet">
        <HideButton onHide={hide} label={t('avalanche.hide')} />
        <p class="eyebrow">{t('avalanche.eyebrow')}</p>
        <p class="text-base font-semibold">{t(HEADLINE[b.status])}</p>
        <p class="text-sm text-muted">
          {t(BODY[b.status])}
          {link ? <> {checkBefore}{link}{checkAfter}</> : null}
        </p>
      </section>
    )
  }

  const level = b.level as DangerLevel
  return (
    <section class={`notice ${level >= 3 ? 'notice-high' : ''}`}>
      <p class="eyebrow">{t('avalanche.eyebrow')}</p>
      <p class="display text-xl font-bold leading-tight">
        <span class="figures">{level}</span> &mdash; {t(`danger.${level}` as MessageKey)}
        {b.region ? <span class="text-base font-normal text-muted"> · {b.region}</span> : null}
      </p>
      {b.bands.length > 1 ? (
        <p class="text-sm text-muted">
          {b.bands.map((x, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : ''}
              {x.aboveM !== null
                ? t('avalanche.band.above', { m: x.aboveM })
                : x.belowM !== null
                  ? t('avalanche.band.below', { m: x.belowM })
                  : t('avalanche.band.overall')}
              : {t(`danger.${x.level}` as MessageKey)}
            </span>
          ))}
        </p>
      ) : null}
      {b.problems.length > 0 ? (
        <p class="text-sm text-muted">{b.problems.join(' · ')}</p>
      ) : null}
      {b.headline ? <p class="text-sm">{b.headline}</p> : null}
      {/*
        * Level alone is not a decision. The bulletin knows the snowpack; it does
        * not know which slope you will stand on, and neither does wanderbar.
        */}
      <p class="text-sm text-muted">
        {t('avalanche.slopeCaveat')}
        {link ? <> {readBefore}{link}{readAfter}</> : null}
      </p>
    </section>
  )
}

/** Each non-answer says plainly that it is not an all-clear. */
const HEADLINE: Record<string, MessageKey> = {
  'no-coverage': 'avalanche.head.noCoverage',
  'out-of-season': 'avalanche.head.outOfSeason',
  stale: 'avalanche.head.stale',
  error: 'avalanche.head.error'
}

const BODY: Record<string, MessageKey> = {
  'no-coverage': 'avalanche.body.noCoverage',
  'out-of-season': 'avalanche.body.outOfSeason',
  stale: 'avalanche.body.stale',
  error: 'avalanche.body.error'
}
