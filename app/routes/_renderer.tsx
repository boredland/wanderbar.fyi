import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script } from 'honox/server'
import { translator } from '../lib/i18n'
import { DEFAULT_LOCALE, LOCALES, localePath } from '../lib/i18n/locale'

/*
 * Absolute URLs, because og:image and canonical are not resolved against the
 * document base by every crawler. wrangler.jsonc pins this host as a custom
 * domain and MET_USER_AGENT/VAPID_SUBJECT name it too.
 */
const CANONICAL = 'https://wanderbar.fyi'
const TITLE = 'wanderbar - weather for the rest of your hike'
const DESCRIPTION =
  'Weather warnings for the rest of your hike: one GPX track, a pace-based ETA, and a nudge only when conditions change.'
/* The desktop forecast screenshot doubles as the share card: it is already 16:9. */
const SHARE_IMAGE = '/screenshots/wide-1-forecast.png'
const SHARE_IMAGE_ALT =
  "wanderbar showing a hike's weather timeline beside the track's elevation profile"

export default jsxRenderer(({ children }, c) => {
  const locale = c.get('locale') ?? DEFAULT_LOCALE
  const t = translator(locale)
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#eaede6" />
        <meta name="description" content={t('app.description')} />
        {/*
         * Both spellings, deliberately. Chromium deprecated the apple- prefix
         * and warns when it stands alone, but iOS before 15.4 reads only that
         * one and launches in a browser tab without it.
         */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="wanderbar" />

        {/*
         * One canonical origin. The manifest's share_target, the service worker
         * scope and the push subscription are all origin-bound, so a copy served
         * from any other host is not a working install and must not be indexed
         * as an alternative.
         */}
        <link rel="canonical" href={`${CANONICAL}${localePath(locale)}`} />
        {/*
         * Reciprocal hreflang across all three, plus x-default on the root.
         * Each language is a real URL, so a crawler indexes three documents
         * rather than one; without these they would compete as near-duplicates.
         * x-default points at `/`, which is also the URL that negotiates from
         * Accept-Language for a reader who has expressed no preference.
         */}
        {LOCALES.map((l) => (
          <link key={l} rel="alternate" hreflang={l} href={`${CANONICAL}${localePath(l)}`} />
        ))}
        <link rel="alternate" hreflang="x-default" href={`${CANONICAL}/`} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="wanderbar" />
        <meta property="og:url" content={`${CANONICAL}${localePath(locale)}`} />
        <meta property="og:title" content={t('app.title')} />
        <meta property="og:description" content={t('app.description')} />
        <meta property="og:image" content={`${CANONICAL}${SHARE_IMAGE}`} />
        <meta property="og:image:width" content="1280" />
        <meta property="og:image:height" content="720" />
        <meta property="og:image:alt" content={SHARE_IMAGE_ALT} />
        <meta property="og:locale" content={locale} />
        {/* summary_large_image renders the 16:9 share image; `summary` would crop it. */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t('app.title')} />
        <meta name="twitter:description" content={t('app.description')} />
        <meta name="twitter:image" content={`${CANONICAL}${SHARE_IMAGE}`} />
        <meta name="twitter:image:alt" content={SHARE_IMAGE_ALT} />

        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" async />
      </head>
      <body>{children}</body>
    </html>
  )
})
