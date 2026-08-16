# wanderbar.fyi

An installable PWA that takes **one** GPX track, works out roughly where you are
on it, and shows the weather for the *rest* of it as a time-ordered timeline
backed by a map. Each sync diffs the warning set against the previous one and
notifies only when conditions **worsen or clear**.

## How it is put together

**All weather logic is client-side.** The server never computes a forecast or a
warning. It does exactly three things:

- `GET /api/met`: a stateless proxy whose entire reason to exist is the
  `User-Agent` header MET Norway's ToS requires and browsers cannot set.
- `GET /api/fwi`: joins two Open-Meteo series, ERA5 archive for four months of
  spin-up and the forecast blend for recent and future days, then reduces them
  to one fire-weather input row per day. It exists to move bytes, not secrets:
  the hourly series total ~150 kB against ~9 kB reduced. Coordinates are snapped
  to a 0.25 deg grid and the result is cached for a day, so everyone on a cell
  shares one entry.
- `PUT|DELETE /api/wake`: stores **one** push subscription plus **one**
  whole-hour schedule in a single Durable Object, and sends an empty wake-up
  push on that schedule.

The service worker does the rest: on `push` it reads IndexedDB, fetches the
forecast, evaluates warnings, diffs against the previous set, and shows a
notification only on change. It also caches the app shell so wanderbar starts
without a network; see the offline constraint below.

```
GPX ─→ parse ─→ resample (≤60 wpts) ─→ pace profile ─→ ETAs
                                                        │
   Open-Meteo (direct, CORS *) ────────────────────────►├─→ warnings ─→ diff ─→ notify?
   MET Norway (via /api/met, cross-check only) ────────►│
                                                        ▼
                                                    IndexedDB
```

### Deliberate constraints

- **No routing engine.** Sparse route-only GPX is rejected with an explicit
  message, never expanded.
- **The only server state is a push subscription and a schedule.** No D1, no KV,
  no R2, no queue, no cron. The DO's own alarm replaces them.
- **Positioning is 2D.** GPS `altitude` is the wrong datum (ellipsoidal vs the
  GPX/DEM orthometric metres), platform-inconsistent and too noisy, so it is
  stored for diagnostics and read by nothing.
- **The cache holds the app, never the weather.** The service worker precaches
  the document, every hashed asset, the fonts and the weather icons at `install`,
  then keeps them fresh at runtime (network-first on the document, cache-first on
  hashed assets), so a cold start with no signal reaches the forecast already in
  IndexedDB instead of a browser error page. Precaching is not an optimisation
  here: a worker does not control the page that registered it, so on a first
  visit every `/static/*` request goes *around* the fetch handler. Runtime
  caching alone would leave someone who opens wanderbar once and walks out of
  signal with a cached document and no code to run it. It never touches `/api/*`
  or any non-GET request, so live data cannot be served stale and the
  share-target POST cannot be swallowed.
  Forecast age has never been an HTTP concern (it is `forecast.fetchedAt`), and
  caching the shell does not change it by a second. What it does change is that
  the app now *looks* alive offline, which is what `app/lib/freshness.ts` pays
  for: one four-step age scale (`fresh`/`aging`/`stale`/`expired` at 2/6/12 h)
  that the notice, the freshness row, the verdict and the timeline all read, so
  they cannot disagree about how much trust the numbers still deserve. At
  `expired` the verdict is **withdrawn**, not restyled: an all-clear computed
  from yesterday's model is not a weaker all-clear, it is a false one. Map tiles
  are the one asset never cached, because bulk tile storage is against the
  OpenTopoMap and OSM usage policies. Offline the map says so in words rather than
  showing a blank sheet that reads as missing route data.
- **Three languages, three URLs, one page.** English at `/`, German at `/de`,
  French at `/fr`, rendered by one `Page` component so they cannot drift.
  English stays unprefixed because every link already shared points there.
  `routes/_middleware.ts` picks the locale from the path and redirects only the
  bare root on `Accept-Language` (302 + `Vary`, never 301: the header is the
  device's answer, not the reader's). The reader's own choice lives in
  IndexedDB and outranks both, but it is applied by *navigating*
  (`islands/locale-gate.tsx`), because an English document with French islands
  hydrated over it makes `<html lang>` and the prose disagree, which is wrong
  for a screen reader and wrong for a crawler.
- **Warning details are data, not prose.** `Warning.detail` is a discriminated
  union of measured values (`{ kind: 'gusts', gustKmh: 62 }`), rendered by
  `detailText` at display time. It used to be a baked English sentence, which
  was wrong twice: warnings are persisted in IndexedDB and re-read on every
  offline start, so the string pinned the language the forecast was fetched in;
  and `toFixed` hard-coded a decimal point, which is not how a German or French
  reader writes a number. `diffWarnings` keys on `(seq, condition)` and never
  reads `detail`, so this cannot affect which notifications fire. A language
  switch now re-renders a stored forecast without refetching anything.
- **The English catalogue is the source of truth.** `app/lib/i18n/en.ts` defines
  `MessageKey`; `de.ts` and `fr.ts` are typed `Messages`, so a key added to
  English and forgotten in German is a build error rather than a blank line on
  a mountain. Counts inflect through `Intl.PluralRules`, never a hand-rolled
  `n === 1`. `LOWERCASES_NOUNS` exists because German capitalises nouns
  mid-sentence: the verdict line must read "dann Regen", not "dann regen".
- **Translations are reviewed against DeepL, not generated by it.** The
  catalogues are hand-written; `scripts/review-translations.mjs` asks DeepL for
  an independent rendering of every English string and reports where ours
  diverges, ranked by word overlap. Divergence is usually correct: DeepL
  defaults to Sie/vous where wanderbar uses du/tu, translates the product name,
  and renders bare UI labels without context ("Down" as *Daunen*, feathers). It
  is a second opinion on meaning, never the source of copy. Needs `DEEPLX_KEY`;
  the endpoint is our own deeplx instance, since the shared keyless one gets
  IP-blocked by DeepL.
- **The two danger scales are pinned to the issuing services' own words.** EAWS
  for avalanche (French level 2 is *Limité*, never *Modéré*) and EFFIS for fire
  danger, verified against those services and locked by a test. A reader
  comparing wanderbar against a bulletin has to find the same term, so these
  are not translation choices and DeepL is not the authority on them.
- **Relayed bulletin text is never translated.** An avalanche bulletin is an
  official safety document and is shown in the language its service publishes
  it in, with `avalanche.sourceLanguage` saying so. Machine-translating one is
  not something wanderbar will do.
- **localStorage holds hidden-notice flags and nothing else.** Every byte of
  track and forecast data lives in the IndexedDB behind `store.ts`. The two
  `wanderbar:hidden:*` keys are per-device chrome preference, and they are read
  synchronously during hydration so a hidden notice does not flash back in for
  a frame. They default to *visible* on failure: storage being blocked or full
  must never be able to hide a safety notice from someone who did not hide it.
- **Elevation is single-source per track** (`eleSource`): all-GPX, or all-DEM.
  Mixing them fabricates ascent at every boundary.
- **Fire danger is computed, not fetched.** No public API serves a free
  point-query Fire Weather Index. OpenWeatherMap's needs a paid key; EFFIS/GWIS
  layers are WMS tiles with a broken WFS backend and `GetMap` returns colourised
  PNG, not values; CWFIS is Canada-only. Copernicus CDS *does* publish the
  authoritative CEMS product, but it is an authenticated async job queue that
  returns whole-globe NetCDF/GRIB per request, and the reanalysis runs days
  behind, which is unusable for a live per-point forecast. So the Canadian FWI
  System is implemented client-side in `app/lib/fwi.ts` from Open-Meteo history,
  which needs no key. It is an **indication**, never a substitute for an
  official fire ban.
- **FWI inputs are sampled at local solar noon, not daily aggregates.** The
  system is calibrated on noon-LST observations, and `Tmax`/`RHmean`/`Wmax` each
  sit on a different point of the diurnal curve, so the error compounds through
  the running moisture codes. Rain is the exception: it is the 24 h total
  *ending* at noon. This mirrors how the Copernicus CEMS/GEFF reanalysis derives
  its own inputs per grid cell (Vitolo et al. 2020, Sci Data 7:216).
  Checked against that reanalysis, sampling at noon beat daily aggregates on
  every measure.
- **Fire-weather history comes from ERA5, the forecast from the model blend.**
  The archive endpoint is the same reanalysis CEMS runs on and is the better
  input, but it has no forecast; the forecast endpoint has one but caps history
  at 93 days and pads the excess with nulls. So the archive supplies the
  spin-up and the blend takes over three days before the present. Measured over
  19 days and 121 European points, that is **5.26 FWI mean absolute error and
  61.6% of danger classes exactly right, against 5.57 and 59.4%** for the blend
  alone, significant on both (t = 5.35, McNemar p < 0.01). Handing over at one
  day loses significance and at seven admits too much of the weaker source.
  Spin-up is 120 days because winter rain resets the Drought Code annually, so
  240 and 668 score identically.
- **Danger classes round up near an edge.** Our FWI scatters a few points
  against the reference, so a value just below a boundary is as likely to belong
  above it, and up is the safe way to be wrong about fire. A 0.25 margin
  recovers under-calls essentially free (61.6% correct with 379 under-calls
  becomes 61.8% with 352) and beats the blend on both axes at once. The effect
  is flat between 0.1 and 0.4, and holds on days it was not chosen on, so it is
  not tuned to one week.
- **A short spin-up is suppressed, not downgraded.** If the archive leg fails
  only a few days of history survive, and a run that short under-called the
  danger class on half of samples, a seventh of them by two classes or more. The
  route returns 502 below 30 usable days so the client keeps its last reading
  instead of showing a quietly reassuring one.
- **The remaining fire-danger error is the floor, not a bug.** Comparing each
  code against the CEMS equivalents locates it. FFMC, which carries no history
  and is computed from a single day's weather, agrees to 3%; ISI is 2.3 off.
  So the daily inputs are sound. The long-memory codes drift instead: DMC 44%,
  DC 31% low, because 60 days of spin-up cannot accumulate a season of drought.
  Seeding the Drought Code higher nonetheless makes the result *worse*, from
  5.8 to 5.9 and four danger classes lost, because FWI is dominated by ISI at
  these levels: a 30% move in ISI shifts FWI 22 to 34, the same move in BUI
  only 24 to 32. Our low DC and high DMC currently cancel into a Buildup Index
  two points off CEMS, and correcting one alone breaks the cancellation.
  A fitted bias correction fails too. `cems ~ a + b * ours` gives b around
  0.85, so the compression is real, but the slope wanders between 0.81 and 0.93
  from day to day. Cross-validated over four days and 121 points, it improves
  the held-out day by 0.19 FWI, which is not significant (t = 1.50), and it
  makes the danger class *worse*, 276 correct of 484 against 271. What is left
  is CEMS running ERA5 on its own grid against our keyless model blend.
  Individual points can be far off, 38.5N 27E reads 61.9 against 82.8, which is
  the honest reason the number is presented as an indication, never a fire ban.
- **Avalanche danger is fetched, never computed, the exact inverse of fire.**
  Fire danger is computed here because no free API serves it and the FWI is a
  defensible model of weather. Avalanche danger is the opposite on both counts:
  real keyless APIs exist, and no forecast variable exposes what actually
  governs it, namely the structure of the snowpack and the persistent weak
  layers buried in it weeks ago. So `app/lib/avalanche.ts` only ever relays an
  official bulletin and never derives one.
- **The bulletin is not a `Warning`, and that is a safety decision.** Every
  other condition is per-waypoint, per-hour, and its absence is meaningful: no
  rain warning means the models say no rain. A bulletin is regional and daily,
  and its absence means nothing at all: most of the world has no service, the
  ones that exist run only in winter, and a fetch can fail. Folding it into
  `warnings` would render those cases as the green *"No un-wanderbar weather
  ahead"* verdict, i.e. an all-clear on a loaded slope. So it is its own field
  on `Forecast` and its own panel, and `BulletinStatus` makes every non-answer
  (`no-coverage`, `out-of-season`, `stale`, `error`) a state the UI must say out
  loud. There are tests asserting no danger level survives any of them.
- **An expired bulletin loses its number, not just its styling.** The
  avalanche.report "latest" endpoint served a bulletin dated May when queried in
  August, so this is observed behaviour, not a hypothetical. A greyed-out "3"
  still reads as "3" at a cold trailhead, so `withFreshness` nulls the level,
  bands and problems outright.
- **It never claims a slope is safe.** wanderbar knows neither slope angle nor
  aspect, which is most of what decides whether a given metre of ground slides,
  so the panel always says so and always links to the issuing service. The
  danger level is a pointer to the real bulletin, never a substitute for it.
- **Avalanche is deliberately absent from the notify/diff path.**
  `diffWarnings` keys on `(seq, condition)` and ignores detail, so a bulletin
  escalating from 2 to 4 would produce no key change and no notification. That is
  worse than silence, because it would look like the system had checked. Bulletin
  changes are shown on the page instead.
- **The pace constants are moving time only.** DIN 33466 and the SAC scale both
  exclude breaks, so rest is an explicit multiplier (`REST_FACTORS`) the user
  picks, never a tweak to the published numbers.
- **Wind chill is computed, never taken from `apparent_temperature`.** That
  variable folds in humidity and radiation, so it is not the published index:
  measured against JAG/TI on a cold alpine day it sat about 4 °C low in light
  wind, which is the wrong direction to be wrong about frostbite. `windChillC`
  implements the JAG/TI 2001 model the US NWS and Environment Canada both
  publish, and returns null outside its stated range (above 10 °C, or at or
  below 4.8 km/h) rather than extrapolating: in calm air the index collapses to
  the temperature, and a still -20 °C is an ordinary winter day, not a warning.
- **Freezing rain is its own condition.** WMO codes 56, 57, 66 and 67 fall as
  liquid and glaze on contact, so they sit in neither `RAIN_CODES` nor
  `SNOW_CODES` and raised *nothing at all* before `ice` existed. It is the one
  winter hazard that looks like clear weather from indoors.
- **Lying snow is a separate warning from falling snow.** `snow` reads
  `snowfall`, `deepsnow` reads `snow_depth`; deep snow is a hazard on a bluebird
  day and the sky says nothing about it. The 30 cm default is roughly where an
  unbroken track stops being a walk: SAC/DAV put trail breaking at 200–300 m/h
  of ascent against 400 on a made track. No pace constant can know whether
  someone else went first, so the warning says what the profile cannot.
- **Schedules are whole hours only.** No minute field exists in `Schedule`.

### The push is a wake-up, not a warning

Web push has no silent mode: `userVisibleOnly: true` is mandatory. A handler
that shows nothing makes Chrome display *"This site has been updated in the
background."* This design notifies only on change, so unchanged weather produces
that fallback once per interval, an accepted tradeoff bounded by the 3-hour
default interval and 07:00–19:00 active hours. Do **not** "fix" it by notifying
on every wake; that is lock-screen spam.

## Layout

| Path | Role |
|---|---|
| `app/lib/track.ts` | Geometry, `PROFILES`, `paceTime`, snapping, dead reckoning |
| `app/lib/gpx.ts` | GPX parsing (split out so the service worker stays small) |
| `app/lib/warnings.ts` | Thresholds, warning `source`, wind chill, and the worsen/clear diff |
| `app/lib/avalanche.ts` | Official bulletins: providers, region matching, freshness |
| `app/islands/avalanche-panel.tsx` | The bulletin panel and its four "unknown" states |
| `app/lib/schedule.ts` | Whole-hour, DST-correct wake scheduling |
| `app/lib/fwi.ts` | Canadian FWI System (Van Wagner & Pickett 1985) |
| `app/routes/api/fwi.ts` | Cached noon-sampled fire-weather inputs |
| `app/lib/icons.ts` | WMO → MET icon mapping |
| `app/lib/i18n/en.ts` | Every message key; the contract `de.ts`/`fr.ts` are checked against |
| `app/lib/i18n/index.ts` | `translator`, `detailText`, `plural`, `num`, `parts` |
| `app/lib/i18n/locale.ts` | `LOCALES`, path prefixes, `Accept-Language` parsing |
| `app/routes/_middleware.ts` | Locale from path; root-only language negotiation |
| `app/routes/-page.tsx` | The one screen, rendered per locale |
| `app/routes/-faq.tsx` | 12 answers x 3 languages, each with its JSON-LD twin |
| `app/islands/locale-gate.tsx` | Applies a stored language choice by navigating |
| `scripts/review-translations.mjs` | Diffs de/fr against DeepL, ranked by divergence |
| `app/lib/freshness.ts` | The one forecast-age scale every staleness treatment reads |
| `app/lib/online.ts` | `useOnline`; explains *why* data is old, never how old |
| `app/lib/dismiss.tsx` | `useHidden` + the shared hide control, backed by localStorage |
| `app/style.css` | Design tokens, `.profile` gutter, `.notice`, shared control surfaces |
| `app/lib/store.ts` | The only IndexedDB access; imported by page *and* worker |
| `app/lib/sync.ts` | Fetch → evaluate → diff → persist |
| `app/waker.ts` | The Durable Object: one subscription, one schedule |
| `app/sw/index.ts` | Service worker source; `public/sw.js` is **generated** |
| `scripts/precache-manifest.ts` | Writes `app/sw/precache.ts` from the built asset manifest |

`public/sw.js` is built by `npm run build:sw` and gitignored. Never edit it.
`app/sw/precache.ts` is likewise generated and gitignored. Build order matters:
`vite build --mode client` must run *first*, because the precache list is derived
from the hashed filenames it emits, and `build:sw` bundles that list into the
worker. `npm run build` sequences all three.

Anything `.tsx` under `app/islands/` **is** an island: honox matches
`^/app/islands/.+?\.tsx$` and makes each one a client entry. A test file named
`.tsx` there therefore ships to the browser. `avalanche-panel.test.tsx` put a
258 kB chunk in `dist/static/` before it was renamed. Island tests are `.ts`,
which is why `avalanche-panel.test.ts` calls the component as a function rather
than rendering JSX.

## Design

The page is built as a **topographic sheet**: warm grey-green paper
(`--color-surface`), lighter cutouts for panels, contour hairlines, and margin
lettering (`.eyebrow`) set in condensed Archivo.

- **Route orange (`--color-route`) is a fill, never text.** On paper it measures
  2.37:1 and fails AA. It is the app mark and the map's "still to walk" polyline;
  wherever it carries meaning, ink sits on top of it (5.63:1). The text accent is
  `--color-brand`, a deep alpine lake (6.5:1), and warnings are `--color-warn`
  oxide red (6.4:1). Every text/ground pair in the theme clears WCAG AA.
- **`.notice` is one surface, used twice.** The best-effort banner and the
  avalanche bulletin are both wanderbar stating its own limits rather than
  reporting weather, so they share a card instead of being two lookalikes that
  drift. `.notice-high` is the highlight, a warn-red edge over a 6% wash, for
  the one that must be read first; `.notice-quiet` goes dashed, because an
  absent bulletin is not a warning but an absence, and dressing it as danger
  would train people to dismiss it.
- **Both notices can be hidden, but a danger level never can.** A caveat that
  cannot be silenced is one people learn to look past, so `.notice-hide` is
  offered on the best-effort banner and on the bulletin's four *unknown*
  states, which repeat unchanged every sync and cannot be acted on. It is
  deliberately **not** rendered when the bulletin carries a rating: nobody gets
  to dismiss a 4 and have it stay dismissed. `app/islands/avalanche-panel.tsx`
  checks `hidden` only inside the `status !== 'ok'` branch, and there is a test
  asserting the control is absent at all five levels.
- **The timeline's left gutter is the track's own elevation profile.** The
  profile is turned on its side so progress runs *down* the gutter, matching the
  reading direction: each row's lower edge is the next row's upper edge, which is
  what lets rows grow to fit warnings while the ridge stays continuous. See
  `ProfileSegment` in `app/islands/track-view.tsx`. Warned segments add a hatch
  overlay and a red edge, so a warning never rests on colour alone.
- **Two typefaces, self-hosted.** Archivo (variable, with a real width axis) for
  display, figures and margin lettering; Atkinson Hyperlegible Next for body,
  because it is drawn to disambiguate letterforms and misreading `15°` as `16°`
  here is a navigation error, not a typo. Both are latin-subset woff2 in
  `public/fonts/`: an installable PWA used on a mountain must not depend on a
  font CDN. Regenerate the icon PNGs from the SVGs if the mark ever changes;
  the maskable variant is deliberately full-bleed and opaque.
- **One animation.** The profile wipes in with the verdict on load, and nothing
  else on the page moves. `prefers-reduced-motion` disables it with
  `!important`, because component classes set their own transitions.

## Discoverability

One indexable URL, so the SEO surface is small and stays that way:

- `public/robots.txt` blocks only `/api/*`. Nothing there has a document to
  index, and crawling `/api/met` would burn the rate limit MET Norway's ToS
  grants this User-Agent. Note `Allow: /` is deliberately absent: it is the
  default anyway, and stating it defeats the `Disallow` under longest-match
  precedence in strict parsers.
- `public/sitemap.xml` lists the single page and is not padded to look larger.
- `public/llms.txt` states the deliberate limits in the words we want quoted,
  since the honest ones ("best-effort", "never a reason to set out", "FWI is an
  indication, not a fire ban") are the ones that must survive summarisation.
- `_renderer.tsx` owns canonical, Open Graph and Twitter tags from one set of
  constants; `wanderbar.fyi` is load-bearing, not cosmetic (see wrangler.jsonc).
- The homepage carries `WebApplication` JSON-LD. `offers` is required for a free
  listing to validate.
- The footer FAQ carries `FAQPage` JSON-LD. This earns **no** Google rich result
  (restricted to government and health sources since Aug 2023); it is there for
  the assistants that do quote it, because the FAQ answers are where the honest
  caveats live and those are the sentences that must survive summarisation. Each
  entry keeps a plain-prose `text` beside its JSX `a`, so the version a machine
  quotes is one a human wrote. Update both or neither.
- The best-effort disclaimer stays a visible banner, never an FAQ row: a safety
  caveat must not be one click away. The FAQ deliberately has no "how much should
  I trust it" entry, because the banner already answers it in the open. It sits
  **above** the forecast and there is exactly **one** of it. It used to be
  stated twice, in the footer and again inside the track, which is how a caveat
  becomes furniture: the reader learns to skip it, and the copy drifts apart
  until the two versions promise different things.

### Showing which provider said what

Every `Warning` carries a `source`. It is real information, not a credit line:
a thunderstorm can be raised by Open-Meteo's weather code, by MET's thunder
probability, or by both, and fire danger is computed on the device rather than
forecast by anyone.

Two rules keep it from becoming noise:

- **The default is never printed.** Open-Meteo raises almost every warning, so
  labelling each row with it repeats one answer down the whole timeline. Only
  `met`, `open-meteo+met` and `computed` are shown, in the timeline and in map
  popups. A warning with no label is an ordinary Open-Meteo reading.
- **`diffWarnings` ignores `source`.** The key stays `(seq, condition)`. A storm
  both providers saw, which later only MET still calls, is the same storm;
  keying on source would buzz the lock screen every time the models drifted
  apart, which is the noise the diff exists to prevent. There is a test for this.

Notifications deliberately omit it: the body is capped at three warnings, and on
a lock screen *where* and *when* beat *who said so*.

Elevation source (`eleSource`) is shown once under Up/Down rather than against
all sixty waypoints, because it is a property of the whole track.

### Manifest screenshots

`public/screenshots/` feeds Chrome's richer install UI. Chrome enforces:
min 320px, max 3840px, aspect ratio ≤ 2.3:1, **and a single consistent aspect
ratio per `form_factor`**. Mixing ratios within one form factor silently
disables the richer UI. Desktop needs at least one `wide`, Android at least one
`narrow`, so both are present (1280×720 and 1080×1920, both 16:9).

Regenerate by driving a real track through `wrangler dev`, not by scaling
existing files: a screenshot must show real forecast data, and one of the narrow
shots deliberately shows the *warned* state, which is what the app is for.

## Development

```bash
npm install
npm run dev      # Vite on :5173
npm run build
npx wrangler dev # the real Worker + Durable Object on :8787
npm test         # 156 unit tests over the pure logic
```

`VAPID_PRIVATE_KEY` (the JWK `d` scalar, **not** pkcs8) goes in `.dev.vars`
locally and `npx wrangler secret put VAPID_PRIVATE_KEY` in production.

## Gotchas worth knowing

- **Match Open-Meteo responses to waypoints by array index, never by
  coordinate**: returned lat/lon are grid-snapped and two waypoints can
  collapse onto one cell.
- **`hail` and `thunderstorm_probability` are all-null** from Open-Meteo; hail
  and thunder are derived from `weather_code`.
- **Six vendored icon files carry a doubled `s`** (`lightssleetshowers…`) while
  MET's API returns the correct spelling. `metIcon` remaps them; without that
  they 404.
- **`diffWarnings` keys on `(seq, condition)` and never `forecastHour`**: the
  hour drifts every sync and would notify every single time.
- **`Waker.alarm()` must re-arm on every path** except a dead subscription
  (404/410). A DO holds at most one pending alarm.
- **The DO class must be re-exported from the built entry**. See the
  `entryContentAfterHooks` in `vite.config.ts`, which keeps the adapter's own
  hook (it defines `merged`) ahead of ours.
- **Leave the `` `esbuild` option was specified by "honox-vite-client" ``
  build warning alone.** Vite 8 moved to Oxc and deprecated the top-level
  `esbuild` option; honox 0.1.60, the latest release, still sets
  `esbuild.jsxImportSource` and there is no upstream fix. Do **not** "fix" it by
  adding a top-level `oxc` option: `oxc` beats `esbuild` for *both* builds, so
  it forces `hono/jsx/dom` into the SSR bundle too and every page 500s with
  `TypeError: e.search is not a function`. It has to stay a client-only setting,
  which is honox's job, not ours. Removal is not until Vite 9.

## Attribution

Type: [Archivo](https://fonts.google.com/specimen/Archivo) and
[Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next),
both SIL Open Font License 1.1.

Avalanche bulletins by their issuing services, shown unaltered and always
linked: [SLF](https://www.slf.ch/) (Switzerland),
[avalanche.report](https://avalanche.report/) (Euregio),
[Varsom/NVE](https://varsom.no/) (Norway) and
[Avalanche Canada](https://avalanche.ca/).

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0,
non-commercial tier). Cross-check from the Norwegian Meteorological Institute /
Yr (CC BY 4.0). Map tiles © [OpenTopoMap](https://opentopomap.org) (CC-BY-SA),
data © OpenStreetMap contributors. Weather icons ©
[MET Norway](https://github.com/metno/weathericons) (MIT).
