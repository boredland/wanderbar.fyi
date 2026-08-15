import { HideButton, useHidden } from '../lib/dismiss'
import { num, plural, splitAround, useLocale, type MessageKey, type T } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'
import type { Wildfires } from '../lib/wildfire'

/**
 * Fires seen burning near the route, as its own panel rather than a timeline
 * row, for the same reason as the avalanche bulletin.
 *
 * The timeline is a forecast, where an empty row means the models expect
 * nothing. This is an observation log: a satellite either looked and saw
 * something, or has not looked here recently enough to say. Rendering "no
 * detection" as the green all-clear would turn a gap in coverage into a promise
 * there is no fire, so every state below says which one it is.
 *
 * It reports distance and time and nothing else. Where a fire will be tomorrow
 * is not in a thermal pixel, so the panel points at the civil-protection
 * service rather than pretending to advise.
 */
export default function WildfirePanel(props: { wildfires: Wildfires | null; locale: Locale }) {
  /*
   * Hooks before the early returns, so hook order does not depend on whether
   * the fetch has landed yet.
   */
  const [hidden, hide] = useHidden('wildfire-quiet')
  const [locale, t] = useLocale(props.locale)
  const w = props.wildfires
  if (!w) return null

  const [checkBefore, checkAfter] = splitAround(t, 'wildfire.checkYourself', 'link')

  const link = (
    <a class="underline" href={w.providerUrl} target="_blank" rel="noopener noreferrer">
      {w.provider}
    </a>
  )

  if (w.status !== 'ok') {
    /*
     * Both quiet states are dismissable because neither is actionable: they
     * say the same thing on every sync until something actually burns. A panel
     * that names a live fire never gets the control.
     */
    if (hidden) return null
    const key = w.status === 'none' ? 'none' : 'error'
    return (
      <section class="notice notice-quiet">
        <HideButton onHide={hide} label={t('wildfire.hide')} />
        <p class="eyebrow">{t('wildfire.eyebrow')}</p>
        <p class="text-base font-semibold">{t(`wildfire.head.${key}` as MessageKey)}</p>
        <p class="text-sm text-muted">
          {t(`wildfire.body.${key}` as MessageKey, { hours: w.windowHours })} {checkBefore}
          {link}
          {checkAfter}
        </p>
      </section>
    )
  }

  const nearest = w.hotspots[0]
  const nearKm = (w.nearestM ?? 0) / 1000
  /*
   * Close enough that the walk itself is in question, rather than the view
   * being hazy. Not a safety margin: it decides how loud the panel is, and the
   * distance is printed either way so the reader judges for themselves.
   *
   * A truncated response is always treated as close, because the fire that did
   * not fit in the response could be nearer than the one that did.
   */
  const close = nearKm <= 5 || w.truncated

  return (
    <section class={`notice ${close ? 'notice-high' : ''}`}>
      <p class="eyebrow">{t('wildfire.eyebrow')}</p>
      <p class="display text-xl font-bold leading-tight">
        {/*
          * Waypoint spacing makes this distance approximate, so a detection
          * inside a kilometre is reported as such rather than rounded: "0.0 km"
          * is absurd, and "43 m" claims a precision the sampling cannot carry.
          */}
        {w.truncated
          ? t('wildfire.manyNearby')
          : nearKm < 1
            ? t('wildfire.nearestUnderKm')
            : t('wildfire.nearest', { km: num(locale, nearKm, 1) })}
      </p>
      <p class="text-sm text-muted">
        {plural(t, locale, 'wildfire.seen', w.hotspots.length, {
          hours: w.windowHours,
          ago: sinceText(t, locale, nearest.acquiredAtMs, w.fetchedAtMs)
        })}
        {nearest.satellite ? ` · ${nearest.satellite}` : ''}
        {nearest.confidence
          ? ` · ${t(`wildfire.confidence.${nearest.confidence}` as MessageKey)}`
          : ''}
      </p>
      {/*
       * A hotspot is one pixel that was hot at one moment. Where the fire goes
       * next depends on wind, fuel and terrain that this app does not model,
       * and the people who do model it are the ones to ask.
       */}
      <p class="text-sm text-muted">
        {w.truncated ? `${t('wildfire.truncated')} ` : ''}
        {t('wildfire.caveat')} {checkBefore}
        {link}
        {checkAfter}
      </p>
    </section>
  )
}

/**
 * How long ago the nearest detection was, in whole hours.
 *
 * Deliberately coarse: minutes would suggest the satellite watches
 * continuously, and it does not. Under an hour reads as "within the hour"
 * rather than a number that will be wrong before it is read.
 */
function sinceText(t: T, locale: Locale, atMs: number, nowMs: number): string {
  const hours = Math.floor((nowMs - atMs) / 3600_000)
  if (hours < 1) return t('wildfire.withinHour')
  return t('wildfire.hoursAgo', { n: num(locale, hours) })
}
