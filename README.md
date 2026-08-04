# wanderbar.fyi

An installable PWA that takes **one** GPX track, works out roughly where you are
on it, and shows the weather for the *rest* of it as a time-ordered timeline
backed by a map. Each sync diffs the warning set against the previous one and
notifies only when conditions **worsen or clear**.

## How it is put together

**All weather logic is client-side.** The server never computes a forecast or a
warning. It does exactly two things:

- `GET /api/met`: a stateless proxy whose entire reason to exist is the
  `User-Agent` header MET Norway's ToS requires and browsers cannot set.
- `PUT|GET|DELETE /api/wake`: stores **one** push subscription plus **one**
  whole-hour schedule in a single Durable Object, and sends an empty wake-up
  push on that schedule.

The service worker does the rest: on `push` it reads IndexedDB, fetches the
forecast, evaluates warnings, diffs against the previous set, and shows a
notification only on change.

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
- **Elevation is single-source per track** (`eleSource`): all-GPX, or all-DEM.
  Mixing them fabricates ascent at every boundary.
- **Fire danger is computed, not fetched.** No public API serves a free
  point-query Fire Weather Index (OpenWeatherMap's needs a paid key; EFFIS/GWIS
  layers are WMS tiles with a broken WFS backend; CWFIS is Canada-only). So the
  Canadian FWI System is implemented client-side in `app/lib/fwi.ts` from
  Open-Meteo's `past_days` history, which needs no key. It is an **indication**,
  never a substitute for an official fire ban.
- **The pace constants are moving time only.** DIN 33466 and the SAC scale both
  exclude breaks, so rest is an explicit multiplier (`REST_FACTORS`) the user
  picks, never a tweak to the published numbers.
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
| `app/lib/warnings.ts` | Thresholds, warning `source`, and the worsen/clear diff |
| `app/lib/schedule.ts` | Whole-hour, DST-correct wake scheduling |
| `app/lib/fwi.ts` | Canadian FWI System (Van Wagner & Pickett 1985) |
| `app/lib/icons.ts` | WMO → MET icon mapping |
| `app/style.css` | Design tokens, `.profile` gutter, shared control surfaces |
| `app/lib/store.ts` | The only IndexedDB access; imported by page *and* worker |
| `app/lib/sync.ts` | Fetch → evaluate → diff → persist |
| `app/waker.ts` | The Durable Object: one subscription, one schedule |
| `app/sw/index.ts` | Service worker source; `public/sw.js` is **generated** |

`public/sw.js` is built by `npm run build:sw` and gitignored. Never edit it.

## Design

The page is built as a **topographic sheet**: warm grey-green paper
(`--color-surface`), lighter cutouts for panels, contour hairlines, and margin
lettering (`.eyebrow`) set in condensed Archivo.

- **Route orange (`--color-route`) is a fill, never text.** On paper it measures
  2.37:1 and fails AA. It is the app mark and the map's "still to walk" polyline;
  wherever it carries meaning, ink sits on top of it (5.63:1). The text accent is
  `--color-brand`, a deep alpine lake (6.5:1), and warnings are `--color-warn`
  oxide red (6.4:1). Every text/ground pair in the theme clears WCAG AA.
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
  I trust it" entry, because the banner already answers it in the open.

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
ratio per `form_factor`** — mixing ratios within one form factor silently
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
npm test         # 47 unit tests over the pure logic
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

## Attribution

Type: [Archivo](https://fonts.google.com/specimen/Archivo) and
[Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next),
both SIL Open Font License 1.1.

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0,
non-commercial tier). Cross-check from the Norwegian Meteorological Institute /
Yr (CC BY 4.0). Map tiles © [OpenTopoMap](https://opentopomap.org) (CC-BY-SA),
data © OpenStreetMap contributors. Weather icons ©
[MET Norway](https://github.com/metno/weathericons) (MIT).
