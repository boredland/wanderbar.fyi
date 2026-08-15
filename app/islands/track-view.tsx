import { useCallback, useEffect, useState } from 'hono/jsx'
import AvalanchePanel from './avalanche-panel'
import WildfirePanel from './wildfire-panel'
import { ConditionIcon } from '../lib/condition-icon'
import { freshnessOf, type Freshness } from '../lib/freshness'
import {
  ageText,
  clockAt,
  detailText,
  num,
  parts,
  useLocale,
  type MessageKey,
  type T
} from '../lib/i18n'
import { LOWERCASES_NOUNS, type Locale } from '../lib/i18n/locale'
import { isDayHour, wmoIcon } from '../lib/icons'
import { notifyDelta } from '../lib/notify'
import { useOnline } from '../lib/online'
import { get, set, type Fix, type Forecast, type Track } from '../lib/store'
import { syncNow } from '../lib/sync'
import type { Waypoint } from '../lib/track'
import type { Hour } from '../lib/weather'
import type { Warning } from '../lib/warnings'
import { estimatePosition, startAnchorMs } from '../lib/track'
import TrackMap from './track-map'

/**
 * Where the heights came from. 740 m read out of your own GPX and 740 m taken
 * from a global elevation model are not the same claim, and only one of them
 * was measured anywhere near the trail.
 */
const ELE_SOURCE: Record<Track['eleSource'], MessageKey | null> = {
  gpx: 'stats.eleFromGpx',
  dem: 'stats.eleFromDem',
  none: null
}

const OLD_FIX_MS = 6 * 3600_000
const REFRESH_MS = 30 * 60_000

/** Times more than a day out need their date, or "07:00" is ambiguous. */
const dayTime = (locale: Locale, ms: number, now: number) => {
  const sameDay = new Date(ms).toDateString() === new Date(now).toDateString()
  return sameDay
    ? clockAt(locale, ms)
    : new Date(ms).toLocaleString(locale, {
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

const hoursToText = (t: T, s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? t('duration.hoursMinutes', { h, m }) : t('duration.minutes', { m })
}

export default function TrackView(props: { locale: Locale }) {
  const [locale, t] = useLocale(props.locale)
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
  const online = useOnline()

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

  if (!loaded) return <div class="py-6 text-muted">{t('common.loading')}</div>

  // First run: without this the page is a logo above four collapsed panels,
  // which tells a new visitor nothing about what the app is for.
  if (!track) {
    return (
      <section class="flex flex-col gap-3">
        <h2 class="display text-xl font-bold">{t('empty.heading')}</h2>
        <p class="text-sm text-muted">{t('empty.body')}</p>
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
          {t('empty.cta')}
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
  // One reading of the clock for the whole page: the notice, the verdict, the
  // freshness row and the timeline must not disagree about how old this is.
  const freshness = freshnessOf(forecast?.fetchedAt ?? null, now)

  return (
    <div class="flex flex-col gap-6">
      <h2 class="display text-xl font-bold">{track.name}</h2>

      <StaleNotice
        forecast={forecast}
        freshness={freshness}
        online={online}
        done={done}
        now={now}
        t={t}
        locale={locale}
      />

      <Verdict
        done={done}
        forecast={forecast}
        remaining={remaining}
        warningsBySeq={warningsBySeq}
        anchorMs={anchorMs}
        now={now}
        freshness={freshness}
        t={t}
        locale={locale}
      />

      <AvalanchePanel bulletin={forecast?.avalanche ?? null} locale={locale} />

      <WildfirePanel wildfires={forecast?.wildfires ?? null} locale={locale} />

      <PositionLine
        track={track}
        fix={fix}
        currentSeq={currentSeq}
        now={now}
        anchorMs={anchorMs}
        t={t}
        locale={locale}
      />

      <StartRow track={track} now={now} onChanged={refetch} t={t} locale={locale} />

      <FreshnessRow
        forecast={forecast}
        lastError={lastError}
        fetching={fetching}
        now={now}
        freshness={freshness}
        online={online}
        onRefetch={refetch}
        t={t}
        locale={locale}
      />

      <dl class="graticule flex flex-wrap gap-x-6 gap-y-2 pb-3">
        {(
          [
            ['stats.time', hoursToText(t, totalS), null],
            ['stats.distance', `${num(locale, track.lengthM / 1000, 1)} km`, null],
            // Heights are a property of the whole track, so the source belongs
            // here rather than repeated against all sixty waypoints.
            ['stats.up', `${num(locale, Math.round(track.ascentM))} m`, ELE_SOURCE[track.eleSource]],
            [
              'stats.down',
              `${num(locale, Math.round(track.descentM))} m`,
              ELE_SOURCE[track.eleSource]
            ]
          ] as [MessageKey, string, MessageKey | null][]
        ).map(([label, value, note]) => (
          <div key={label}>
            <dt class="eyebrow">{t(label)}</dt>
            <dd class="figures text-lg font-bold">{value}</dd>
            {note ? <dd class="text-2xs text-muted">{t(note)}</dd> : null}
          </div>
        ))}
      </dl>

      {done ? (
        <p class="text-base">{t('verdict.done')}</p>
      ) : forecast === null ? (
        <p class="text-base text-muted">{t('timeline.fetching')}</p>
      ) : null}

      <Timeline
        remaining={remaining}
        forecast={forecast}
        warningsBySeq={warningsBySeq}
        anchorMs={anchorMs}
        now={now}
        freshness={freshness}
        t={t}
        locale={locale}
      />

      <TrackMap
        simplified={track.simplified}
        bbox={track.bbox}
        remaining={remaining}
        currentSeq={currentSeq}
        warningsBySeq={warningsBySeq}
        forecast={forecast}
        anchorMs={anchorMs}
        online={online}
        locale={locale}
      />

      <CapabilityLine subscribed={subscribed} schedule={schedule} t={t} />

      <p class="text-xs text-muted">
        {t('credits.weatherBy')}{' '}
        <a class="underline" rel="noopener noreferrer" href="https://open-meteo.com/">
          Open-Meteo.com
        </a>{' '}
        · {t('credits.crossCheck')} · {t('credits.icons')}{' '}
        <a class="underline" rel="noopener noreferrer" href="https://github.com/metno/weathericons">
          MET Norway
        </a>{' '}
        (MIT)
      </p>
    </div>
  )
}

/**
 * How old the numbers are, stated before they are read.
 *
 * This is the price of working offline. The app now starts from cache with a
 * complete-looking page — verdict, timeline, elevation profile, map — built
 * entirely from the last successful sync, and nothing on that page looks any
 * different at ten hours old than at ten minutes. A grey footnote does not
 * carry that; it has to be said above the forecast, in the same `.notice`
 * surface the best-effort caveat and the avalanche bulletin use, because like
 * those two this is wanderbar stating its own limits rather than reporting
 * weather.
 *
 * Never dismissable, and deliberately not given a HideButton: unlike an absent
 * avalanche bulletin, this one goes away by itself the moment a sync succeeds.
 * Anything the reader could hide here they would be hiding for the rest of the
 * hike, which is precisely when it matters most.
 */
function StaleNotice(props: {
  forecast: Forecast | null
  freshness: Freshness
  online: boolean
  done: boolean
  now: number
  t: T
  locale: Locale
}) {
  // A finished hike has no hours ahead to be wrong about, and "never fetched"
  // is already the whole of what the page says while the first sync runs.
  if (props.done) return null
  if (props.freshness === 'fresh' || props.freshness === 'aging') return null
  if (!props.forecast) return null

  const t = props.t
  const age = ageText(t, props.locale, props.now - props.forecast.fetchedAt)
  const expired = props.freshness === 'expired'

  return (
    <section class="notice notice-high" role="status" aria-live="polite">
      <p class="eyebrow">{t('stale.eyebrow')}</p>
      <p class="text-base font-semibold">
        {expired ? t('stale.headingExpired', { age }) : t('stale.headingStale', { age })}
      </p>
      <p class="text-sm text-muted">
        {expired ? t('stale.bodyExpired') : t('stale.bodyStale')}{' '}
        {props.online ? t('stale.online') : t('stale.offline')}
      </p>
    </section>
  )
}

function Verdict(props: {
  done: boolean
  forecast: Forecast | null
  remaining: Waypoint[]
  warningsBySeq: Record<number, Warning[]>
  anchorMs: number
  now: number
  freshness: Freshness
  t: T
  locale: Locale
}) {
  const t = props.t
  if (props.done) {
    return (
      <div class="verdict flex items-start gap-3">
        <span class="disc text-lg" aria-hidden="true">
          ✓
        </span>
        <p class="display pt-2 text-xl font-bold leading-tight">{t('verdict.done')}</p>
      </div>
    )
  }
  if (!props.forecast) {
    return (
      <p class="display text-xl font-bold leading-tight text-muted">{t('verdict.checking')}</p>
    )
  }
  /*
   * The one line on this page people act on, so past twelve hours it is
   * withdrawn rather than restyled. "No un-wanderbar weather ahead" computed
   * from yesterday's model is not a weaker all-clear, it is a false one, and
   * the same holds for a warning that has since passed or moved.
   */
  if (props.freshness === 'expired') {
    return (
      <p class="display text-xl font-bold leading-tight text-muted">{t('verdict.expired')}</p>
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
        <p class="display pt-2 text-xl font-bold leading-tight text-clear">{t('verdict.clear')}</p>
      </div>
    )
  }
  const at = props.anchorMs + first.wp.etaOffsetS * 1000
  const raw = t(`condition.${first.w.condition}` as MessageKey)
  // German capitalises nouns mid-sentence; "dann regen" is not a word.
  const word = LOWERCASES_NOUNS[props.locale] ? raw.toLowerCase() : raw
  const label = <span class="text-warn">{word}</span>
  // "Clear until X" is a lie when the very first waypoint is already warned.
  const immediate = first.wp.seq === props.remaining[0]?.seq
  const sentence = parts(t, immediate ? 'verdict.immediate' : 'verdict.later', {
    km: num(props.locale, first.wp.cumDistM / 1000, 1)
  })
  return (
    <div class="verdict flex items-start gap-3">
      <span class="disc disc-warn" aria-hidden="true">
        <ConditionIcon condition={first.w.condition} size={22} />
      </span>
      <p class="display text-xl font-bold leading-tight" role="status" aria-live="polite">
        {sentence.map((part, i) =>
          typeof part === 'string' ? (
            <span key={i}>{part}</span>
          ) : part.slot === 'condition' ? (
            <span key={i}>{label}</span>
          ) : (
            <span key={i} class="figures">
              {dayTime(props.locale, at, props.now)}
            </span>
          )
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
  t: T
  locale: Locale
}) {
  const t = props.t
  const km = (props.track.waypoints[props.currentSeq]?.cumDistM ?? 0) / 1000
  if (!props.fix) {
    // Honesty rule: say which assumption the times rest on.
    if (props.track.startAt === null) {
      return <p class="text-sm text-muted">{t('position.startAssumeNow')}</p>
    }
    const started = props.anchorMs <= props.now
    const time = dayTime(props.locale, props.anchorMs, props.now)
    return (
      <p class="text-sm text-muted">
        {started ? t('position.started', { time }) : t('position.starting', { time })}
        {started ? t('position.keptPace') : ''}
      </p>
    )
  }
  const measured = props.currentSeq === props.fix.snappedSeq
  const age = props.now - props.fix.at
  const fixKm = (props.track.waypoints[props.fix.snappedSeq]?.cumDistM ?? 0) / 1000
  const stale = age > OLD_FIX_MS ? t('position.fixStale') : ''
  const offTrack = props.fix.snappedDistM > 5000 ? t('position.offTrack') : ''
  const time = clockAt(props.locale, props.fix.at)
  return (
    <p class="text-sm text-muted">
      {measured
        ? t('position.youAreAt', { km: num(props.locale, fixKm, 1), time })
        : t('position.estimated', { km: num(props.locale, km, 1), time })}
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

function startOptions(t: T, locale: Locale, now: number): { value: string; label: string }[] {
  const out = [{ value: '', label: t('start.now') }]
  const first = new Date(now)
  first.setMinutes(0, 0, 0)
  first.setHours(first.getHours() + 1)
  for (let i = 0; i < START_SLOTS; i++) {
    // `slot`, not `t`: the translator is already bound to that name here.
    const slot = new Date(first.getTime() + i * 3600_000)
    const days = Math.round(
      (new Date(slot).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400_000
    )
    const hh = `${String(slot.getHours()).padStart(2, '0')}:00`
    const day =
      days === 0
        ? t('start.today')
        : days === 1
          ? t('start.tomorrow')
          : slot.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    out.push({ value: String(slot.getTime()), label: `${day} ${hh}` })
  }
  return out
}

function StartRow(props: {
  track: Track
  now: number
  onChanged: () => void
  t: T
  locale: Locale
}) {
  const t = props.t
  const options = startOptions(t, props.locale, props.now)
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
      <span class="text-sm text-muted">{t('start.label')}</span>
      <select
        class="field figures font-medium"
        value={current}
        onChange={(e) => choose((e.target as HTMLSelectElement).value)}
      >
        {current !== '' && !options.some((o) => o.value === current) ? (
          <option value={current} selected>
            {dayTime(props.locale, Number(current), props.now)}
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
  freshness: Freshness
  online: boolean
  onRefetch: () => void
  t: T
  locale: Locale
}) {
  const t = props.t
  const old = props.freshness === 'stale' || props.freshness === 'expired'
  return (
    <div class="graticule flex items-center justify-between gap-4 pb-3">
      <p
        role="status"
        aria-live="polite"
        class={`text-sm ${old ? 'font-medium text-warn' : 'text-muted'}`}
      >
        {props.forecast ? (
          <>
            {/*
              * Clock time and elapsed age, together. "09:14" alone is read as
              * recent by anyone who has lost track of the hour, which on a long
              * day is everyone; "7 hours ago" alone cannot be checked against a
              * watch. Each covers the other's failure.
              */}
            {t('fresh.lastFetched', {
              time: clockAt(props.locale, props.forecast.fetchedAt),
              age: ageText(t, props.locale, props.now - props.forecast.fetchedAt)
            })}
          </>
        ) : (
          t('fresh.never')
        )}
        {props.lastError ? ` · ${t('fresh.attemptFailed')}` : ''}
        {!props.online ? ` · ${t('fresh.offline')}` : ''}
      </p>
      <button
        type="button"
        class="btn shrink-0"
        disabled={props.fetching}
        onClick={props.onRefetch}
      >
        {props.fetching ? t('fresh.refetching') : t('fresh.refetch')}
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
  freshness: Freshness
  t: T
  locale: Locale
}) {
  const t = props.t
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

  /*
   * Past twelve hours the timeline is demoted rather than hidden. It still
   * carries the route, the distances and the elevation profile, none of which
   * expire, and it is the only place the old weather can be inspected at all.
   * Muting it stops it being *read* as the forecast while the notice above says
   * it is not one.
   */
  const expired = props.freshness === 'expired'

  return (
    <ol
      class={`overflow-hidden rounded-[10px] border border-line bg-raised ${
        expired ? 'opacity-60 saturate-50' : ''
      }`}
    >
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
                  {dayTime(props.locale, at, props.now)}
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
                <div class="flex flex-col gap-1">
                  {ws.map((w) => (
                    <span
                      key={w.condition}
                      class="inline-flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold text-warn"
                    >
                      <ConditionIcon
                        condition={w.condition}
                        size={16}
                        class="translate-y-0.5"
                      />
                      <span>
                        {t(`condition.${w.condition}` as MessageKey)} (
                        {detailText(t, props.locale, w.detail)})
                      </span>
                      {/*
                       * Only when it is NOT the usual source. Open-Meteo raises
                       * almost every warning, so printing it on each row repeats
                       * one answer down the whole timeline and teaches nothing.
                       * Naming the exceptions is what carries information: MET
                       * saw a storm Open-Meteo did not, or the fire index was
                       * computed here rather than forecast by anyone.
                       */}
                      {w.source === 'open-meteo' ? null : (
                        <span class="font-normal text-muted">
                          {t(`source.${w.source}` as MessageKey)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              ) : null}
              {met ? (
                <p class="text-xs text-muted">
                  {t('timeline.metLine', {
                    temp:
                      met.tempC === null
                        ? t('timeline.noValue')
                        : `${num(props.locale, met.tempC)} °C`
                  })}
                  {met.precipMm !== null
                    ? t('timeline.metPrecip', { mm: num(props.locale, met.precipMm, 1) })
                    : ''}
                  {disagree ? ` · ${t('timeline.sourcesDisagree')}` : ''}
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
  t: T
}) {
  const t = props.t
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`
  const denied =
    typeof Notification !== 'undefined' && Notification.permission === 'denied'
  return (
    <p class="text-sm text-muted">
      {t('capability.onWhileOpen')}
      {props.subscribed && props.schedule
        ? t('capability.background', {
            n: props.schedule.intervalH,
            from: pad(props.schedule.startH),
            to: pad(props.schedule.endH)
          })
        : ''}
      {denied ? t('capability.enableToBackground') : ''}
    </p>
  )
}
