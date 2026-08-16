import { FAQ_BY_LOCALE } from './-faq'
import BestEffort from '../islands/best-effort'
import LanguageSwitcher from '../islands/language-switcher'
import LocaleGate from '../islands/locale-gate'
import Manage from '../islands/manage'
import PositionButton from '../islands/position-button'
import ScheduleSettings from '../islands/schedule-settings'
import Settings from '../islands/settings'
import TrackView from '../islands/track-view'
import Upload from '../islands/upload'
import { translator } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'

/**
 * The single screen, in one language.
 *
 * Shared by `/` and `/[locale]` so there is one page and three URLs rather than
 * three pages that drift. Everything language-dependent arrives as `locale`:
 * the islands take it as a prop because HonoX islands cannot read the request
 * context, and they re-read the reader's stored choice once they hydrate.
 */
export function Page(props: { locale: Locale; shareError?: string; vapidPublicKey: string }) {
  const { locale } = props
  const t = translator(locale)
  const FAQ = FAQ_BY_LOCALE[locale]
  const shareError = props.shareError
  return (
    <main class="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      {/* The bare word "wanderbar" says nothing in a result list. */}
      <title>{t('app.title')}</title>
      {/*
       * FAQPage earns no Google rich result on a site like this (restricted to
       * government and health sources since Aug 2023). It is here for the
       * assistants that do quote it: the answers below are where the honest
       * caveats live, and those are the sentences that must survive being
       * summarised by something that never read the rest of the page.
       */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no JSX form.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.text }
            }))
          })
        }}
      />
      {/*
       * WebApplication, not SoftwareApplication: this is used in the browser and
       * installed from it, and offers is required for a free listing to validate.
       */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no JSX form.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'wanderbar',
            url: 'https://wanderbar.fyi',
            description: t('app.description'),
            applicationCategory: 'TravelApplication',
            browserRequirements: 'Requires JavaScript and a modern browser.',
            operatingSystem: 'Any',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            featureList: [
              'Weather along a GPX track, ordered by when you reach each point',
              'Pace-based ETAs from published standards (DIN 33466, DAV, SAC)',
              'Warnings only when conditions worsen or clear',
              'Background checks on a schedule you choose',
              'Works as an installable app'
            ],
            screenshot: 'https://wanderbar.fyi/screenshots/wide-1-forecast.png',
            inLanguage: locale
          })
        }}
      />
      <header class="graticule flex items-baseline gap-3 pb-3">
        <img src="/icon.svg" width="28" height="28" alt="" class="translate-y-1 rounded-[6px]" />
        <h1 class="display text-lg font-bold">wanderbar</h1>
        <p class="eyebrow ml-auto">{t('app.tagline')}</p>
      </header>

      <LocaleGate locale={locale} />

      <div class="flex justify-end">
        <LanguageSwitcher locale={locale} />
      </div>

      {/*
        * Above the forecast, not under it. This is the frame the whole page is
        * read through, so it cannot sit past sixty waypoints and a map where
        * the people most likely to act on a wrong number never reach it. It
        * shares the .notice surface with the avalanche bulletin because both
        * are wanderbar stating its own limits rather than reporting weather.
        */}
      <BestEffort locale={locale} />

      <TrackView locale={locale} />

      <details class="panel" id="new-track">
        <summary>
          <h2 class="eyebrow">{t('panel.newTrack')}</h2>
        </summary>
        <div class="p-4">
          <Upload shareError={shareError} locale={locale} />
        </div>
      </details>

      <details class="panel">
        <summary>
          <h2 class="eyebrow">{t('panel.thisTrack')}</h2>
        </summary>
        <div class="flex flex-col gap-4 p-4">
          <PositionButton locale={locale} />
          <Manage locale={locale} />
        </div>
      </details>

      <details class="panel">
        <summary>
          <h2 class="eyebrow">{t('panel.warningSettings')}</h2>
        </summary>
        <div class="p-4">
          <Settings locale={locale} />
        </div>
      </details>

      <details class="panel">
        <summary>
          <h2 class="eyebrow">{t('panel.background')}</h2>
        </summary>
        <div class="p-4">
          <ScheduleSettings vapidPublicKey={props.vapidPublicKey} locale={locale} />
        </div>
      </details>

      <footer class="flex flex-col gap-3 border-t border-line pt-4 text-xs text-muted">
        <section class="flex flex-col gap-1" aria-labelledby="faq-heading">
          <h2 id="faq-heading" class="eyebrow pb-1">
            {t('panel.questions')}
          </h2>

          {FAQ.map((item) => (
            <details key={item.q} class="border-t border-line">
              <summary class="flex min-h-[44px] cursor-pointer items-center py-2 text-sm font-semibold text-ink">
                {item.q}
              </summary>
              <div class="flex flex-col gap-2 pb-3 text-xs text-muted">{item.a}</div>
            </details>
          ))}
        </section>

        <a class="underline" rel="noopener noreferrer" href="https://github.com/boredland/wanderbar.fyi">
          {t('credits.source')}
        </a>
      </footer>
    </main>
  )
}
