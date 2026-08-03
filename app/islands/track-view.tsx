import { useCallback, useEffect, useState } from 'hono/jsx'
import { conditionGlyph, conditionLabel, isDayHour, wmoIcon } from '../lib/icons'
import { notifyDelta } from '../lib/notify'
import { get, type Fix, type Forecast, type Track } from '../lib/store'
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

  if (!loaded) return <div class="py-6 text-[--color-muted]">Loading…</div>
  if (!track) return null

  const currentSeq = estimatePosition(track.waypoints, fix, track.startAt, now)
  const anchorMs = startAnchorMs(track.waypoints, fix, track.startAt, now)
  const remaining = track.waypoints.filter((w) => w.seq >= currentSeq)
  const warningsBySeq: Record<number, Warning[]> = {}
  for (const w of forecast?.warnings ?? []) (warningsBySeq[w.seq] ??= []).push(w)

  const done = remaining.length === 0
  const totalS = track.waypoints[track.waypoints.length - 1]?.etaOffsetS ?? 0

  return (
    <div class="flex flex-col gap-6">
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

      <FreshnessRow
        forecast={forecast}
        lastError={lastError}
        fetching={fetching}
        now={now}
        onRefetch={refetch}
      />

      <p class="text-[14px] text-[--color-muted]">
        Total {hoursToText(totalS)} · {(track.lengthM / 1000).toFixed(1)} km ·{' '}
        {Math.round(track.ascentM)} m up
      </p>

      {done ? (
        <p class="text-[16px]">This hike is done.</p>
      ) : forecast === null ? (
        <p class="text-[16px] text-[--color-muted]">
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

      <p class="text-[12px] text-[--color-muted]">
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
  if (props.done) return <p class="text-[28px] font-bold">This hike is done.</p>
  if (!props.forecast) {
    return <p class="text-[28px] font-bold text-[--color-muted]">Checking the weather ahead…</p>
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
      <p class="text-[28px] font-bold text-[--color-clear]">No un-wanderbar weather ahead.</p>
    )
  }
  const at = props.anchorMs + first.wp.etaOffsetS * 1000
  return (
    <p class="text-[28px] font-bold">
      Clear until <span class="figures">{dayTime(at, props.now)}</span>, then{' '}
      <span class="text-[--color-warn]">
        {conditionGlyph[first.w.condition]} {conditionLabel[first.w.condition].toLowerCase()}
      </span>{' '}
      at <span class="figures">km {(first.wp.cumDistM / 1000).toFixed(0)}</span>.
    </p>
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
      return <p class="text-[14px] text-[--color-muted]">Times assume you start now.</p>
    }
    const started = props.anchorMs <= props.now
    return (
      <p class="text-[14px] text-[--color-muted]">
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
    <p class="text-[14px] text-[--color-muted]">
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

function FreshnessRow(props: {
  forecast: Forecast | null
  lastError: { at: number; message: string } | null
  fetching: boolean
  now: number
  onRefetch: () => void
}) {
  const stale = props.forecast !== null && props.now - props.forecast.fetchedAt > STALE_MS
  return (
    <div class="flex items-center gap-4">
      <p class={`text-[14px] ${stale ? 'text-[--color-warn]' : 'text-[--color-muted]'}`}>
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
        class="min-h-[44px] min-w-[44px] rounded-[6px] border border-[--color-line] px-4 py-2 disabled:opacity-60"
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

  return (
    <ol>
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

        return (
          <li
            key={wp.seq}
            class={`flex flex-col gap-1 px-3 py-3 ${i % 2 === 1 ? 'bg-[--color-raised]' : ''} ${
              ws.length ? 'border-l-[3px] border-[--color-warn]' : ''
            }`}
          >
            <div class="flex items-center gap-3">
              <span class="figures text-[16px] font-medium">{dayTime(at, props.now)}</span>
              <span class="figures text-[14px] text-[--color-muted]">
                km {(wp.cumDistM / 1000).toFixed(1)}
              </span>
              <img
                src={wmoIcon(hour?.code ?? null, isDayHour(at))}
                width="28"
                height="28"
                alt=""
              />
              <span class="figures text-[16px]">
                {hour?.tempC === null || hour === null ? '—' : `${hour.tempC.toFixed(0)} °C`}
              </span>
              {ws.map((w) => (
                <span key={w.condition} class="text-[14px] text-[--color-warn]">
                  {conditionGlyph[w.condition]} {conditionLabel[w.condition]} ({w.detail})
                </span>
              ))}
            </div>
            {met ? (
              <p class="text-[12px] text-[--color-muted]">
                MET: {met.tempC === null ? '—' : `${met.tempC.toFixed(0)} °C`}
                {met.precipMm !== null ? `, ${met.precipMm.toFixed(1)} mm` : ''}
                {disagree ? ' · sources disagree' : ''}
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
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
    <p class="text-[14px] text-[--color-muted]">
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
