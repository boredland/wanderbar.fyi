import { createRoute } from 'honox/factory'
import Manage from '../islands/manage'
import PositionButton from '../islands/position-button'
import ScheduleSettings from '../islands/schedule-settings'
import Settings from '../islands/settings'
import TrackView from '../islands/track-view'
import Upload from '../islands/upload'

const A = (props: { children?: unknown; href: string }) => (
  <a class="underline" rel="noopener noreferrer" href={props.href}>
    {props.children}
  </a>
)

/**
 * `text` is the same answer as plain prose, for the FAQPage JSON-LD below.
 * Keeping both here rather than stripping tags at runtime means the version a
 * machine quotes is one a human wrote, and it stays in sync by sitting inline.
 */
const FAQ: { q: string; a: unknown; text: string }[] = [
  {
    q: 'What if I lose reception while it is syncing?',
    a: (
      <>
        <p>
          The forecast you already have stays on screen. A failed fetch never blanks the
          timeline; the freshness line just adds &ldquo;last attempt failed&rdquo;, and the
          time next to &ldquo;Last fetched&rdquo; is always visible so you can judge for
          yourself how old the numbers are.
        </p>
        <p>
          What does not work offline is opening wanderbar fresh. There is no offline cache
          on purpose: a cache here would serve you a stale forecast that looks current,
          which is worse than an error. So load your track and sync before you lose
          signal, and keep the tab or the app open on the way.
        </p>
      </>
    ),
    text:
      'The forecast you already have stays on screen. A failed fetch never blanks the timeline; the freshness line adds "last attempt failed", and the "Last fetched" time is always visible so you can judge how old the numbers are. What does not work offline is opening wanderbar fresh: there is deliberately no offline cache, because a cache would serve a stale forecast that looks current, which is worse than an error. Load your track and sync before you lose signal, and keep it open on the way.'
  },
  {
    q: 'Is my data safe?',
    a: (
      <>
        <p>
          Your track, your position and every forecast are stored only in this browser, and
          there is no account to create. The server has no database for them: it keeps one
          push subscription and one schedule, which is all it needs to wake your device.
          It cannot compute a warning, and it never sees where you are.
        </p>
        <p>
          Two things do leave your device, both to fetch weather. Waypoint coordinates go
          to <A href="https://open-meteo.com/">Open-Meteo</A> directly, rounded to four
          decimals. The cross-check coordinates pass through this site on their way to{' '}
          <A href="https://api.met.no/">MET Norway</A>, because their terms require an
          identifying User-Agent that a browser cannot set. That proxy stores nothing.
        </p>
        <p>Deleting the track, or the browser&rsquo;s site data, removes all of it.</p>
      </>
    ),
    text:
      'Your track, your position and every forecast are stored only in your browser, and there is no account. The server keeps one push subscription and one schedule, nothing else: it cannot compute a warning and never sees where you are. Two things leave your device, both to fetch weather: waypoint coordinates go to Open-Meteo directly, rounded to four decimals, and the cross-check coordinates pass through this site on the way to MET Norway because their terms require an identifying User-Agent a browser cannot set. That proxy stores nothing. Deleting the track, or the browser site data, removes all of it.'
  },
  {
    q: 'How can it check the weather while it is closed?',
    a: (
      <>
        <p>
          The server sends your device an empty wake-up on the schedule you set. Your own
          device then fetches the forecast, compares it with the last one, and only shows
          a notification if something got worse or cleared.
        </p>
        <p>
          This works best on Android with Chrome, where the system can wake the browser
          even when it is not open. On iPhone and iPad you must add wanderbar to the Home
          Screen first; Safari cannot receive these in a normal tab. On a computer the
          browser has to be running.
        </p>
        <p>
          Web push has no silent mode, so on a check where nothing changed your phone may
          briefly show &ldquo;this site has been updated in the background&rdquo;. That is
          the browser talking, not a weather warning.
        </p>
      </>
    ),
    text:
      'The server sends your device an empty wake-up on the schedule you set. Your device then fetches the forecast, compares it with the last one, and shows a notification only if something worsened or cleared. This works best on Android with Chrome, where the system can wake the browser while it is closed. On iPhone and iPad you must add wanderbar to the Home Screen first, because Safari cannot receive push in a normal tab. On a computer the browser has to be running. Web push has no silent mode, so on a check where nothing changed your phone may briefly show "this site has been updated in the background", which is the browser talking, not a weather warning.'
  },
  {
    q: 'When will it warn me, and when will it stay quiet?',
    a: (
      <p>
        Only when the picture changes. Every check compares the new warnings with the
        previous set and notifies on what got worse or cleared, so a forecast that stays
        bad does not notify you again. You choose which conditions count and at what
        threshold under Warning settings.
      </p>
    ),
    text:
      'Only when the picture changes. Every check compares the new warnings with the previous set and notifies on what worsened or cleared, so a forecast that stays bad does not notify you again. You choose which conditions count, and at what threshold, under Warning settings.'
  },
  {
    q: 'Why does it want a recorded track, not a planned route?',
    a: (
      <p>
        wanderbar has no routing engine, so it cannot join the dots of a route file. It
        needs trackpoints closer than about 200 m apart, which is what a recorded track or
        an exported planned track gives you. A file with a handful of corner points is
        rejected rather than guessed at, because inventing the line between them would
        also invent the weather along it.
      </p>
    ),
    text:
      'wanderbar has no routing engine, so it cannot join the dots of a route file. It needs trackpoints closer than about 200 m apart, which a recorded track or an exported planned track provides. A file with a handful of corner points is rejected rather than guessed at, because inventing the line between them would also invent the weather along it.'
  },
  {
    q: 'How does it know where I will be, and when?',
    a: (
      <>
        <p>
          Your track is sampled into waypoints roughly every 2 km, and each one gets an
          arrival time from published pace standards: DIN 33466 and DAV for hiking, the SAC
          scale for mountain terrain, VAM benchmarks for cycling. Those count moving time
          only, so breaks are a separate setting rather than a fudged pace.
        </p>
        <p>
          Times assume you start when you say and keep that pace. Tap &ldquo;Update my
          position&rdquo; and it re-anchors to where you actually are, so the rest of the
          timeline shifts with you.
        </p>
      </>
    ),
    text:
      'Your track is sampled into waypoints roughly every 2 km, and each gets an arrival time from published pace standards: DIN 33466 and DAV for hiking, the SAC scale for mountain terrain, VAM benchmarks for cycling. Those count moving time only, so breaks are a separate setting. Times assume you start when you say and keep that pace; updating your position re-anchors the rest of the timeline to where you actually are.'
  },
  {
    q: 'Where does the weather come from?',
    a: (
      <>
        <p>
          Hourly temperature, precipitation, wind, gusts and weather codes come from{' '}
          <A href="https://open-meteo.com/">Open-Meteo</A>, fetched by your device for each
          waypoint. Open-Meteo blends several national models (ECMWF, GFS, ICON) rather
          than relying on one. Sunrise and sunset come from the same place.
        </p>
        <p>
          A few checkpoints are cross-checked against{' '}
          <A href="https://api.met.no/">MET Norway</A> (Yr). When the two disagree on
          temperature or rain, the timeline says so instead of quietly picking one.
        </p>
        <p>
          Elevation comes from your GPX file, or from Open-Meteo&rsquo;s Copernicus
          elevation model if it has none. The two are never mixed within one track, because
          that would invent ascent at the join.
        </p>
      </>
    ),
    text:
      'Hourly temperature, precipitation, wind, gusts and weather codes come from Open-Meteo, fetched by your device for each waypoint; Open-Meteo blends several national models (ECMWF, GFS, ICON) rather than relying on one. Sunrise and sunset come from the same place. A few checkpoints are cross-checked against MET Norway (Yr), and when the two disagree on temperature or rain the timeline says so instead of quietly picking one. Elevation comes from your GPX file, or from Open-Meteo Copernicus elevation model if it has none; the two are never mixed within one track because that would invent ascent at the join.'
  },
  {
    q: 'Which forecast said so?',
    a: (
      <>
        <p>
          Almost everything comes from Open-Meteo, so the timeline only names a
          source when it is <em>not</em> that: &ldquo;MET&rdquo; when the Norwegian
          model saw a storm Open-Meteo did not, &ldquo;Open-Meteo + MET&rdquo; when
          both did, and &ldquo;computed here&rdquo; for fire danger, which no
          provider forecasts.
        </p>
        <p>
          A row with no source next to it is an ordinary Open-Meteo reading. The
          heights under Up and Down say whether they came from your GPX file or
          from an elevation model, because those are not the same claim.
        </p>
      </>
    ),
    text:
      'Almost everything comes from Open-Meteo, so the timeline names a source only when it is not that: "MET" when the Norwegian model saw a storm Open-Meteo did not, "Open-Meteo + MET" when both did, and "computed here" for fire danger, which no provider forecasts. A warning with no source beside it is an ordinary Open-Meteo reading. The heights under Up and Down say whether they came from your GPX file or from an elevation model, because those are not the same claim.'
  },
  {
    q: 'How is fire danger worked out?',
    a: (
      <p>
        It is calculated on your device, not fetched: no public service offers a free point
        forecast for it. wanderbar runs the Canadian Fire Weather Index over 60 days of
        Open-Meteo weather history, which is what gives it drought memory rather than
        judging today alone. Treat it as an indication, and always follow the local fire
        ban.
      </p>
    ),
    text:
      'It is calculated on your device rather than fetched, because no public service offers a free point forecast for it. wanderbar runs the Canadian Fire Weather Index over 60 days of Open-Meteo weather history, which gives it drought memory rather than judging today alone. Treat it as an indication and always follow the local fire ban.'
  },
  {
    q: 'What does it cost, and who made it?',
    a: (
      <p>
        Nothing, and there are no accounts, adverts or trackers. It is open source:{' '}
        <A href="https://github.com/boredland/wanderbar.fyi">the code is on GitHub</A>. Map
        tiles are by <A href="https://opentopomap.org">OpenTopoMap</A> from OpenStreetMap
        data, and the weather icons are by{' '}
        <A href="https://github.com/metno/weathericons">MET Norway</A>.
      </p>
    ),
    text:
      'Nothing, and there are no accounts, adverts or trackers. It is open source and the code is on GitHub. Map tiles are by OpenTopoMap from OpenStreetMap data, and the weather icons are by MET Norway.'
  }
]

export default createRoute((c) => {
  const shareError = c.req.query('shareError')
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      {/* The bare word "wanderbar" says nothing in a result list. */}
      <title>wanderbar - weather for the rest of your hike</title>
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
            description:
              'Weather warnings for the rest of your hike: one GPX track, a pace-based ETA, and a nudge only when conditions change.',
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
            inLanguage: 'en'
          })
        }}
      />
      <header class="graticule flex items-baseline gap-3 pb-3">
        <img src="/icon.svg" width="28" height="28" alt="" class="translate-y-1 rounded-[6px]" />
        <h1 class="display text-lg font-bold">wanderbar</h1>
        <p class="eyebrow ml-auto">Weather along your route</p>
      </header>

      <TrackView />

      <details class="panel">
        <summary>
          <h2 class="eyebrow">New track</h2>
        </summary>
        <div class="p-4">
          <Upload shareError={shareError} />
        </div>
      </details>

      <details class="panel">
        <summary>
          <h2 class="eyebrow">This track</h2>
        </summary>
        <div class="flex flex-col gap-4 p-4">
          <PositionButton />
          <Manage />
        </div>
      </details>

      <details class="panel">
        <summary>
          <h2 class="eyebrow">Warning settings</h2>
        </summary>
        <div class="p-4">
          <Settings />
        </div>
      </details>

      <details class="panel">
        <summary>
          <h2 class="eyebrow">Background checks</h2>
        </summary>
        <div class="p-4">
          <ScheduleSettings vapidPublicKey={c.env.VAPID_PUBLIC_KEY} />
        </div>
      </details>

      <footer class="flex flex-col gap-3 border-t border-line pt-4 text-xs text-muted">
        <p class="border-l-[3px] border-warn bg-raised px-3 py-2 text-sm">
          <strong class="font-medium text-ink">This is a best-effort forecast.</strong> The
          data comes from public models and can be wrong, late or missing, and mountain
          weather turns faster than any forecast follows. Always check local sources too
          where you can: the local avalanche or weather service, the hut warden, the
          valley station. Treat wanderbar as one input to your own judgement, never as a
          reason to set out.
        </p>

        <section class="flex flex-col gap-1" aria-labelledby="faq-heading">
          <h2 id="faq-heading" class="eyebrow pb-1">
            Questions
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
          Source on GitHub
        </a>
      </footer>
    </main>
  )
})
