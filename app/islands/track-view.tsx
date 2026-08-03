import { useCallback, useEffect, useState } from 'hono/jsx'
import { ConditionIcon } from '../lib/condition-icon'
import { conditionLabel, isDayHour, wmoIcon } from '../lib/icons'
import { notifyDelta } from '../lib/notify'
import { get, set, type Fix, type Forecast, type Track } from '../lib/store'
import { syncNow } from '../lib/sync'
import type { Waypoint } from '../lib/track'
import type { Hour } from '../lib/weather'
import type { Warning } from '../lib/warnings'
import { estimatePosition, startAnchorMs } from '../lib/track'
import TrackMap from './track-map'

const STALE_MS = 2 * 3600_000
const OLD_FIX_MS = 6 * 3600_000
const REFRESH_MS = 30 * 60_000

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Times more than a day out need their date, or "07:00" is ambiguous. */
const dayTime = (ms: number, now: number) => {
  const sameDay = new Date(ms).toDateString() === new Date(now).toDateString()
  return sameDay
    ? clock(ms)
    : new Date(ms).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
}

const nearestHour = (hours: Hour[], t: number): Hour | null => {
  let best: Hour | null = null
  let bestGap = Infinity
  for (const h of hours) {
    const gap = Math.abs(h.t - t)
    if (gap < bestGap) {
      bestGap = gap
      best = h
    }
  }
  return bestGap <= 3600_000 ? best : null
}

const hoursToText = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export default function TrackView() {
  const [track, setTrack] = useState<Track | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [fix, setFix] = useState<Fix | null>(null)
  const [lastError, setLastError] = useState<{ at: number; message: string } | null>(null)
  const [fetching, setFetching] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [subscribed, setSubscribed] = useState(false)
  const [schedule, setSchedule] = useState<{ intervalH: number; startH: number; endH: number } | null>(
    null
  )

  const reload = useCallback(async () => {
    const [t, f, fx, err, sch] = await Promise.all([
      get('track'),
      get('forecast'),
      get('fix'),
      get('lastFetchError'),
      get('schedule')
    ])
    setTrack(t)
    setForecast(f)
    setFix(fx)
    setLastError(err)
    setSchedule({ intervalH: sch.intervalH, startH: sch.startH, endH: sch.endH })
    setSubscribed(sch.enabled)
    setNow(Date.now())
    setLoaded(true)
  }, [])

  useEffect(() => {
    reload()
    const onChanged = () => reload()
    addEventListener('wanderbar:changed', onChanged)
    return () => removeEventListener('wanderbar:changed', onChanged)
  }, [reload])

  const refetch = useCallback(async () => {
    setFetching(true)
    try {
      const t = await get('track')
      const kmBySeq: Record<number, number> = {}
      for (const w of t?.waypoints ?? []) kmBySeq[w.seq] = w.cumDistM / 1000
      const delta = await syncNow()
      await notifyDelta(delta, kmBySeq)
    } catch {
      // lastFetchError is persisted by syncNow and rendered below.
    } finally {
      setFetching(false)
      await reload()
    }
  }, [reload])

  // Best-effort while open: hidden tabs are throttled and iOS freezes within
  // seconds, which is exactly why the fetched-at timestamp is always visible.
  useEffect(() => {
    const id = setInterval(() => {
      refetch()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [refetch])

  if (!loaded) return <div class="py-6 text-muted">Loading…</div>

  // First run: without this the page is a logo above four collapsed panels,
  // which tells a new visitor nothing about what the app is for.
  if (!track) {
    return (
      <section class="flex flex-col gap-3">
        <h2 class="display text-xl font-bold">Add a GPX track</h2>
        <p class="text-sm text-muted">
          wanderbar works out roughly where you will be along your route and shows the
          weather for the rest of it, warning you only when conditions change.
        </p>
        <button
          type="button"
          class="btn btn-primary self-start"
          onClick={() => {
            const panel = document.querySelector<HTMLDetailsElement>('details:has(input[name="gpx"])')
            if (panel) {
              panel.open = true
              panel.scrollIntoView({ block: 'nearest' })
              panel.querySelector<HTMLInputElement>('input[name="gpx"]')?.focus()
            }
          }}
        >
          Choose a GPX file
        </button>
      </section>
    )
  }

  const currentSeq = estimatePosition(track.waypoints, fix, track.startAt, now)
  const anchorMs = startAnchorMs(track.waypoints, fix, track.startAt, now)
  const remaining = track.waypoints.filter((w) => w.seq >= currentSeq)
  const warningsBySeq: Record<number, Warning[]> = {}
  for (const w of forecast?.warnings ?? []) (warningsBySeq[w.seq] ??= []).push(w)

  const done = remaining.length === 0
  const totalS = track.waypoints[track.waypoints.length - 1]?.etaOffsetS ?? 0

  return (
    <div class="flex flex-col gap-6">
      <h2 class="display text-xl font-bold">{track.name}</h2>

      <Verdict
        done={done}
        forecast={forecast}
        remaining={remaining}
        warningsBySeq={warningsBySeq}
        anchorMs={anchorMs}
        now={now}
      />

      <PositionLine
        track={track}
        fix={fix}
        currentSeq={currentSeq}
        now={now}
        anchorMs={anchorMs}
      />

      <StartRow track={track} now={now} onChanged={refetch} />

      <FreshnessRow
        forecast={forecast}
        lastError={lastError}
        fetching={fetching}
        now={now}
        onRefetch={refetch}
      />

      <dl class="graticule flex flex-wrap gap-x-6 gap-y-2 pb-3">
        {[
          ['Time', hoursToText(totalS)],
          ['Distance', `${(track.lengthM / 1000).toFixed(1)} km`],
          ['Up', `${Math.round(track.ascentM)} m`],
          ['Down', `${Math.round(track.descentM)} m`]
        ].map(([label, value]) => (
          <div key={label}>
            <dt class="eyebrow">{label}</dt>
            <dd class="figures text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {done ? (
        <p class="text-base">This hike is done.</p>
      ) : forecast === null ? (
        <p class="text-base text-muted">
          Fetching the forecast, reload in a moment.
        </p>
      ) : null}

      <Timeline
        remaining={remaining}
        forecast={forecast}
        warningsBySeq={warningsBySeq}
        anchorMs={anchorMs}
        now={now}
      />

      <TrackMap
        simplified={track.simplified}
        bbox={track.bbox}
        remaining={remaining}
        currentSeq={currentSeq}
        warningsBySeq={warningsBySeq}
        forecast={forecast}
        anchorMs={anchorMs}
      />

      <CapabilityLine subscribed={subscribed} schedule={schedule} />

      <p class="border-l-[3px] border-warn bg-raised px-3 py-2 text-sm">
        Best-effort forecast from public models, so it can be wrong or out of date. Check
        local information too where you can.
      </p>

      <p class="text-xs text-muted">
        Weather data by{' '}
        <a class="underline" href="https://open-meteo.com/">
          Open-Meteo.com
        </a>{' '}
        · Cross-check from the Norwegian Meteorological Institute / Yr · Weather icons ©{' '}
        <a class="underline" href="https://github.com/metno/weathericons">
          MET Norway
        </a>{' '}
        (MIT)
      </p>
    </div>
  )
}

function Verdict(props: {
  done: boolean
  forecast: Forecast | null
  remaining: Waypoint[]
  warningsBySeq: Record<number, Warning[]>
  anchorMs: number
  now: number
}) {
  if (props.done) {
    return (
      <div class="verdict flex items-start gap-3">
        <span class="disc text-lg" aria-hidden="true">
          ✓
        </span>
        <p class="display pt-2 text-xl font-bold leading-tight">This hike is done.</p>
      </div>
    )
  }
  if (!props.forecast) {
    return (
      <p class="display text-xl font-bold leading-tight text-muted">
        Checking the weather ahead…
      </p>
    )
  }

  let first: { w: Warning; wp: Waypoint } | null = null
  for (const wp of props.remaining) {
    const ws = props.warningsBySeq[wp.seq]
    if (ws?.length) {
      first = { w: ws[0], wp }
      break
    }
  }
  if (!first) {
    return (
      <div class="verdict flex items-start gap-3">
        <span class="disc disc-clear text-lg" aria-hidden="true">
          ✓
        </span>
        <p class="display pt-2 text-xl font-bold leading-tight text-clear">
          No un-wanderbar weather ahead.
        </p>
      </div>
    )
  }
  const at = props.anchorMs + first.wp.etaOffsetS * 1000
  const label = <span class="text-warn">{conditionLabel[first.w.condition].toLowerCase()}</span>
  // "Clear until X" is a lie when the very first waypoint is already warned.
  const immediate = first.wp.seq === props.remaining[0]?.seq
  return (
    <div class="verdict flex items-start gap-3">
      <span class="disc disc-warn" aria-hidden="true">
        <ConditionIcon condition={first.w.condition} size={22} />
      </span>
      <p class="display text-xl font-bold leading-tight" role="status" aria-live="polite">
        {immediate ? (
          <>
            {label} from the start, at{' '}
            <span class="figures">{dayTime(at, props.now)}</span>.
          </>
        ) : (
          <>
            Clear until <span class="figures">{dayTime(at, props.now)}</span>, then {label} at{' '}
            <span class="figures">km {(first.wp.cumDistM / 1000).toFixed(1)}</span>.
          </>
        )}
      </p>
    </div>
  )
}

function PositionLine(props: {
  track: Track
  fix: Fix | null
  currentSeq: number
  now: number
  anchorMs: number
}) {
  const km = (props.track.waypoints[props.currentSeq]?.cumDistM ?? 0) / 1000
  if (!props.fix) {
    // Honesty rule: say which assumption the times rest on.
    if (props.track.startAt === null) {
      return <p class="text-sm text-muted">Times assume you start now.</p>
    }
    const started = props.anchorMs <= props.now
    return (
      <p class="text-sm text-muted">
        {started ? 'Started' : 'Starting'}{' '}
        <span class="figures">{dayTime(props.anchorMs, props.now)}</span>
        {started ? ' (no position yet, times assume you kept pace)' : ''}
      </p>
    )
  }
  const measured = props.currentSeq === props.fix.snappedSeq
  const age = props.now - props.fix.at
  const fixKm = (props.track.waypoints[props.fix.snappedSeq]?.cumDistM ?? 0) / 1000
  const stale = age > OLD_FIX_MS ? ', your position may be well off' : ''
  const offTrack =
    props.fix.snappedDistM > 5000 ? ', you appear to be >5 km off this track' : ''
  return (
    <p class="text-sm text-muted">
      {measured ? (
        <>
          You&rsquo;re at <span class="figures">km {fixKm.toFixed(1)}</span> (
          <span class="figures">{clock(props.fix.at)}</span>)
        </>
      ) : (
        <>
          ≈ <span class="figures">km {km.toFixed(1)}</span>, estimated from your{' '}
          <span class="figures">{clock(props.fix.at)}</span> position
        </>
      )}
      {stale}
      {offTrack}
    </p>
  )
}

/**
 * Concrete whole-hour slots across Open-Meteo's 16-day range. A native select
 * of real times beats a datetime-local here: no ambiguity about which day an
 * hour belongs to, and one tap on a phone instead of spinning a date wheel.
 */
const START_SLOTS = 16 * 24

function startOptions(now: number): { value: string; label: string }[] {
  const out = [{ value: '', label: 'Now' }]
  const first = new Date(now)
  first.setMinutes(0, 0, 0)
  first.setHours(first.getHours() + 1)
  for (let i = 0; i < START_SLOTS; i++) {
    const t = new Date(first.getTime() + i * 3600_000)
    const days = Math.round(
      (new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400_000
    )
    const hh = `${String(t.getHours()).padStart(2, '0')}:00`
    const day =
      days === 0
        ? 'Today'
        : days === 1
          ? 'Tomorrow'
          : t.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
    out.push({ value: String(t.getTime()), label: `${day} ${hh}` })
  }
  return out
}

function StartRow(props: { track: Track; now: number; onChanged: () => void }) {
  const options = startOptions(props.now)
  // Snap the stored value to the nearest listed slot so the select shows it.
  const current =
    props.track.startAt === null
      ? ''
      : (options.find((o) => o.value === String(props.track.startAt))?.value ??
        String(props.track.startAt))

  const choose = async (value: string) => {
    const ms = value ? Number(value) : null
    await set('track', { ...props.track, startAt: ms })
    // Changed ETAs move the warning windows, so the forecast must resync.
    props.onChanged()
    dispatchEvent(new Event('wanderbar:changed'))
  }

  return (
    <label class="flex flex-wrap items-center gap-3">
      <span class="text-sm text-muted">Start time</span>
      <select
        class="field figures font-medium"
        value={current}
        onChange={(e) => choose((e.target as HTMLSelectElement).value)}
      >
        {current !== '' && !options.some((o) => o.value === current) ? (
          <option value={current} selected>
            {dayTime(Number(current), props.now)}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} selected={o.value === current}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function FreshnessRow(props: {
  forecast: Forecast | null
  lastError: { at: number; message: string } | null
  fetching: boolean
  now: number
  onRefetch: () => void
}) {
  const stale = props.forecast !== null && props.now - props.forecast.fetchedAt > STALE_MS
  return (
    <div class="graticule flex items-center justify-between gap-4 pb-3">
      <p
        role="status"
        aria-live="polite"
        class={`text-sm ${stale ? 'font-medium text-warn' : 'text-muted'}`}
      >
        {props.forecast ? (
          <>
            Last fetched <span class="figures">{clock(props.forecast.fetchedAt)}</span>
          </>
        ) : (
          'Never fetched'
        )}
        {props.lastError ? ' · last attempt failed' : ''}
      </p>
      <button
        type="button"
        class="btn shrink-0"
        disabled={props.fetching}
        onClick={props.onRefetch}
      >
        {props.fetching ? 'Fetching…' : 'Refetch now'}
      </button>
    </div>
  )
}

function Timeline(props: {
  remaining: Waypoint[]
  forecast: Forecast | null
  warningsBySeq: Record<number, Warning[]>
  anchorMs: number
  now: number
}) {
  if (props.remaining.length === 0) return null
  const bySeq: Record<number, Hour[]> = {}
  for (const wf of props.forecast?.waypoints ?? []) bySeq[wf.seq] = wf.hours

  // The elevation profile of what remains, normalised once for every row.
  const eles = props.remaining.map((w) => w.eleM).filter((e): e is number => e !== null)
  const loEle = eles.length ? Math.min(...eles) : 0
  const hiEle = eles.length ? Math.max(...eles) : 0
  const span = hiEle - loEle
  /** Silhouette height at row i, as a 0..1 fraction of the gutter. */
  const height = (i: number) => {
    const ele = props.remaining[i]?.eleM
    if (span <= 0 || ele === undefined || ele === null) return 0.5
    return 0.12 + ((ele - loEle) / span) * 0.76
  }

  return (
    <ol class="overflow-hidden rounded-[10px] border border-line bg-raised">
      {props.remaining.map((wp, i) => {
        const at = props.anchorMs + wp.etaOffsetS * 1000
        const hour = nearestHour(bySeq[wp.seq] ?? [], at)
        const ws = props.warningsBySeq[wp.seq] ?? []
        const metHours = props.forecast?.met[wp.seq]
        const met = metHours ? nearestHour(metHours, at) : null
        const disagree =
          hour && met
            ? (hour.tempC !== null &&
                met.tempC !== null &&
                Math.abs(hour.tempC - met.tempC) > 3) ||
              (hour.precipMm !== null &&
                met.precipMm !== null &&
                hour.precipMm > 0.2 !== met.precipMm > 0.2)
            : false

        const isNext = i === 0
        // Segment endpoints, so consecutive rows tile into one silhouette.
        const hIn = i === 0 ? height(0) : (height(i - 1) + height(i)) / 2
        const hOut =
          i === props.remaining.length - 1 ? height(i) : (height(i) + height(i + 1)) / 2

        return (
          <li
            key={wp.seq}
            class={`relative flex items-stretch ${i > 0 ? 'border-t border-line' : ''} ${
              ws.length ? 'row-warn' : isNext ? 'row-now' : ''
            }`}
          >
            <ProfileSegment inFrac={hIn} outFrac={hOut} warned={ws.length > 0} index={i} />
            <div class="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-3 pr-3">
              {/* Wraps rather than clips: km/elevation drops to its own line
                  on a narrow phone instead of running off the row. */}
              <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span class="figures min-w-[7ch] shrink-0 text-base font-semibold">
                  {dayTime(at, props.now)}
                </span>
                <img
                  src={wmoIcon(hour?.code ?? null, isDayHour(at))}
                  width="28"
                  height="28"
                  alt=""
                  class="shrink-0"
                />
                <span class="figures min-w-[4ch] shrink-0 text-base font-semibold">
                  {hour?.tempC === null || hour === null ? '—' : `${hour.tempC.toFixed(0)}°`}
                </span>
                <span class="figures shrink-0 text-sm text-muted sm:ml-auto">
                  km {(wp.cumDistM / 1000).toFixed(1)}
                  {wp.eleM !== null ? ` · ${Math.round(wp.eleM)} m` : ''}
                </span>
              </div>
              {ws.length ? (
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {ws.map((w) => (
                    <span
                      key={w.condition}
                      class="inline-flex items-center gap-1.5 text-sm font-semibold text-warn"
                    >
                      <ConditionIcon condition={w.condition} size={16} />
                      {conditionLabel[w.condition]} ({w.detail})
                    </span>
                  ))}
                </div>
              ) : null}
              {met ? (
                <p class="text-xs text-muted">
                  MET: {met.tempC === null ? '—' : `${met.tempC.toFixed(0)} °C`}
                  {met.precipMm !== null ? `, ${met.precipMm.toFixed(1)} mm` : ''}
                  {disagree ? ' · sources disagree' : ''}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One row's slice of the track's elevation profile.
 *
 * The profile is turned on its side: progress runs *down* the gutter, matching
 * the direction the timeline itself is read, and elevation becomes horizontal
 * extent. That is what makes the slices tile — each row's lower edge is the next
 * row's upper edge — so however tall a row grows when warnings are added, the
 * gutter stays one continuous ridge rather than a stack of separate diagrams.
 *
 * Warned slices are hatched, the way a paper map marks a hazard area, so the
 * warning does not rest on colour alone.
 */
function ProfileSegment(props: {
  inFrac: number
  outFrac: number
  warned: boolean
  index: number
}) {
  const id = `hatch-${props.index}`
  const xIn = (props.inFrac * 46).toFixed(2)
  const xOut = (props.outFrac * 46).toFixed(2)
  return (
    <div class="profile" aria-hidden="true">
      <svg viewBox="0 0 46 100" preserveAspectRatio="none">
        {props.warned ? (
          <defs>
            <pattern
              id={id}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-warn)" stroke-width="1" />
            </pattern>
          </defs>
        ) : null}
        <path d={`M0 0H${xIn}L${xOut} 100H0Z`} fill="var(--color-line)" />
        {props.warned ? (
          <path d={`M0 0H${xIn}L${xOut} 100H0Z`} fill={`url(#${id})`} opacity="0.5" />
        ) : null}
        <path
          d={`M${xIn} 0L${xOut} 100`}
          fill="none"
          stroke={props.warned ? 'var(--color-warn)' : 'var(--color-muted)'}
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

function CapabilityLine(props: {
  subscribed: boolean
  schedule: { intervalH: number; startH: number; endH: number } | null
}) {
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`
  const denied =
    typeof Notification !== 'undefined' && Notification.permission === 'denied'
  return (
    <p class="text-sm text-muted">
      Warnings appear while wanderbar is open.
      {props.subscribed && props.schedule
        ? ` Background checks run every ${props.schedule.intervalH} h between ${pad(
            props.schedule.startH
          )} and ${pad(props.schedule.endH)}.`
        : ''}
      {denied ? ' Enable notifications to be warned in the background.' : ''}
    </p>
  )
}
