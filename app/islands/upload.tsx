import { useState } from 'hono/jsx'
import { useLocale, type MessageKey } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'
import { ingestGpx } from '../lib/ingest'
import { get } from '../lib/store'
import { DEFAULT_PROFILE, DEFAULT_REST, PROFILES, REST_FACTORS, type ProfileId, type RestId } from '../lib/track'

/** Whole-hour slots over Open-Meteo's 16-day range; see StartRow in track-view. */
function startOptions(
  now: number,
  locale: Locale,
  nowLabel: string,
  todayLabel: string,
  tomorrowLabel: string
) {
  const out = [{ value: '', label: nowLabel }]
  const first = new Date(now)
  first.setMinutes(0, 0, 0)
  first.setHours(first.getHours() + 1)
  for (let i = 0; i < 16 * 24; i++) {
    const slot = new Date(first.getTime() + i * 3600_000)
    const days = Math.round(
      (new Date(slot).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400_000
    )
    const day =
      days === 0
        ? todayLabel
        : days === 1
          ? tomorrowLabel
          : slot.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    out.push({
      value: String(slot.getTime()),
      label: `${day} ${String(slot.getHours()).padStart(2, '0')}:00`
    })
  }
  return out
}

export default function Upload(props: { shareError?: string; locale: Locale }) {
  const [locale, t] = useLocale(props.locale)
  const [error, setError] = useState<string | null>(props.shareError ?? null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: Event) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const data = new FormData(form)
    const file = data.get('gpx')
    if (!(file instanceof File) || file.size === 0) {
      setError(t('upload.chooseFirst'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await ingestGpx({
        xml: await file.text(),
        name: String(data.get('name') ?? ''),
        fallbackName: file.name,
        profile: (String(data.get('profile')) as ProfileId) || DEFAULT_PROFILE,
        rest: (String(data.get('rest')) as RestId) || DEFAULT_REST,
        startAt: data.get('startAt') ? Number(data.get('startAt')) : null
      })
      if (!result.ok) setError(t(result.error))
      else dispatchEvent(new Event('wanderbar:changed'))
    } catch {
      setError(t('upload.unreadable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={onSubmit}>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-muted">{t('upload.file')}</span>
        <input
          type="file"
          name="gpx"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          class="field py-2"
          required
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-muted">{t('upload.name')}</span>
        <input
          type="text"
          name="name"
          class="field"
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-muted">{t('upload.start')}</span>
        <select
          name="startAt"
          class="field figures"
        >
          {startOptions(
            Date.now(),
            locale,
            t('start.now'),
            t('start.today'),
            t('start.tomorrow')
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-muted">{t('upload.profile')}</span>
        <select name="profile" class="field">
          {(Object.keys(PROFILES) as ProfileId[]).map((id) => (
            <option key={id} value={id} selected={id === DEFAULT_PROFILE}>
              {t(`profile.${id}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-muted">{t('upload.breaks')}</span>
        <select name="rest" class="field">
          {(Object.keys(REST_FACTORS) as RestId[]).map((id) => (
            <option key={id} value={id} selected={id === DEFAULT_REST}>
              {t(`rest.${id}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        class="btn btn-primary"
        disabled={busy}
      >
        {busy ? t('upload.adding') : t('upload.submit')}
      </button>
      {error ? <p class="text-sm text-warn">{error}</p> : null}
    </form>
  )
}
