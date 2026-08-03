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
| `app/lib/warnings.ts` | Thresholds and the worsen/clear diff |
| `app/lib/schedule.ts` | Whole-hour, DST-correct wake scheduling |
| `app/lib/fwi.ts` | Canadian FWI System (Van Wagner & Pickett 1985) |
| `app/lib/icons.ts` | WMO → MET icon mapping |
| `app/lib/store.ts` | The only IndexedDB access; imported by page *and* worker |
| `app/lib/sync.ts` | Fetch → evaluate → diff → persist |
| `app/waker.ts` | The Durable Object: one subscription, one schedule |
| `app/sw/index.ts` | Service worker source; `public/sw.js` is **generated** |

`public/sw.js` is built by `npm run build:sw` and gitignored. Never edit it.

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

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0,
non-commercial tier). Cross-check from the Norwegian Meteorological Institute /
Yr (CC BY 4.0). Map tiles © [OpenTopoMap](https://opentopomap.org) (CC-BY-SA),
data © OpenStreetMap contributors. Weather icons ©
[MET Norway](https://github.com/metno/weathericons) (MIT).
