import { createRoute } from 'honox/factory'
import Manage from '../islands/manage'
import PositionButton from '../islands/position-button'
import ScheduleSettings from '../islands/schedule-settings'
import Settings from '../islands/settings'
import TrackView from '../islands/track-view'
import Upload from '../islands/upload'

export default createRoute((c) => {
  const shareError = c.req.query('shareError')
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <title>wanderbar</title>
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

        <details>
          <summary class="eyebrow min-h-[44px] cursor-pointer py-2">
            Where the data comes from
          </summary>
          <dl class="flex flex-col gap-3 pt-2 text-muted">
            <div>
              <dt class="font-medium text-ink">Forecast</dt>
              <dd>
                Hourly temperature, precipitation, wind, gusts and weather codes from{' '}
                <a class="underline" href="https://open-meteo.com/">
                  Open-Meteo
                </a>
                , fetched by your device for each waypoint along the track. Open-Meteo
                blends several national models (ECMWF, GFS, ICON) rather than relying on
                one.
              </dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Second opinion</dt>
              <dd>
                A few checkpoints are cross-checked against the{' '}
                <a class="underline" href="https://api.met.no/">
                  Norwegian Meteorological Institute
                </a>{' '}
                (Yr). When the two disagree on temperature or rain, the timeline says so
                instead of quietly picking one.
              </dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Fire danger</dt>
              <dd>
                Not fetched: no public service offers a free point forecast. wanderbar
                computes the Canadian Fire Weather Index on your device from 60 days of
                Open-Meteo weather history, which is what gives it drought memory. Treat
                it as an indication and always follow local fire bans.
              </dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Daylight</dt>
              <dd>Sunrise and sunset for each waypoint and date, from Open-Meteo.</dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Elevation</dt>
              <dd>
                Taken from your GPX file. If it has none, heights come from Open-Meteo's
                Copernicus digital elevation model instead. The two are never mixed within
                one track, because that would invent ascent at the join.
              </dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Walking times</dt>
              <dd>
                Published pace standards, not guesses: DIN 33466 and DAV for hiking, the
                SAC scale for mountain terrain, VAM benchmarks for cycling. They count
                moving time only, so breaks are a separate setting.
              </dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Your position</dt>
              <dd>
                Only ever from your own device, and only when you ask for it. Your track,
                your position and every forecast stay in this browser: the server stores
                nothing but a notification subscription.
              </dd>
            </div>
            <div>
              <dt class="font-medium text-ink">Map</dt>
              <dd>
                Tiles by{' '}
                <a class="underline" href="https://opentopomap.org">
                  OpenTopoMap
                </a>{' '}
                from OpenStreetMap data. Weather icons by{' '}
                <a class="underline" href="https://github.com/metno/weathericons">
                  MET Norway
                </a>{' '}
                (MIT).
              </dd>
            </div>
          </dl>
        </details>

        <a class="underline" href="https://github.com/boredland/wanderbar.fyi">
          Source on GitHub
        </a>
      </footer>
    </main>
  )
})
