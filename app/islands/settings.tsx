import { useCallback, useEffect, useState } from 'hono/jsx'
import { useLocale, type MessageKey } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'
import { notifyDelta } from '../lib/notify'
import { get, set } from '../lib/store'
import { syncNow } from '../lib/sync'
import type { FireDanger } from '../lib/fwi'
import type { LightningBand } from '../lib/lightning'
import { DEFAULT_THRESHOLDS, type Condition, type Thresholds } from '../lib/warnings'

const CONDITIONS: Condition[] = [
  'rain',
  'hail',
  'wind',
  'snow',
  'heat',
  'blizzard',
  'thunderstorm',
  'darkness',
  'fire',
  'lightning',
  'ice',
  'coldwind',
  'deepsnow'
]

type NumKey = 'heatC' | 'windKmh' | 'rainMm' | 'windChillC' | 'snowDepthM'

export default function Settings(props: { locale: Locale }) {
  const [, msg] = useLocale(props.locale)
  const [t, setT] = useState<Thresholds>(DEFAULT_THRESHOLDS)

  useEffect(() => {
    get('thresholds').then(setT)
  }, [])

  const persist = useCallback(async (next: Thresholds) => {
    setT(next)
    await set('thresholds', next)
    const track = await get('track')
    const kmBySeq: Record<number, number> = {}
    for (const w of track?.waypoints ?? []) kmBySeq[w.seq] = w.cumDistM / 1000
    try {
      await notifyDelta(await syncNow(), kmBySeq)
    } catch {
      // The freshness row surfaces the failure.
    }
    dispatchEvent(new Event('wanderbar:changed'))
  }, [])

  const OWNER: Partial<Record<NumKey, Condition>> = {
    heatC: 'heat',
    windChillC: 'coldwind',
    snowDepthM: 'deepsnow'
  }

  const num = (key: NumKey, label: string, min: number, max: number, step: number) => {
    const owner = OWNER[key]
    const off = owner !== undefined && !t.enabled[owner]
    return (
    <label class="flex items-center justify-between gap-4">
      <span class="text-sm">
        {label}
        {off ? (
          <span class="block text-xs text-muted">
            {msg('settings.enableFirst', { condition: msg(`condition.${owner!}` as MessageKey) })}
          </span>
        ) : null}
      </span>
      <input
        type="number"
        class="field figures w-28"
        min={min}
        max={max}
        step={step}
        value={t[key]}
        disabled={off}
        onChange={(e) => persist({ ...t, [key]: Number((e.target as HTMLInputElement).value) })}
      />
    </label>
    )
  }

  return (
    <div class="flex flex-col gap-3">
      {CONDITIONS.map((c) => (
        <label key={c} class="check-row">
          <input
            type="checkbox"
            checked={t.enabled[c]}
            onChange={(e) =>
              persist({
                ...t,
                enabled: { ...t.enabled, [c]: (e.target as HTMLInputElement).checked }
              })
            }
          />
          <span class="text-base">{msg(`condition.${c}` as MessageKey)}</span>
        </label>
      ))}
      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">{msg('settings.fireDangerFrom')}</span>
        <select
          class="field"
          disabled={!t.enabled.fire}
          value={t.fireDanger}
          onChange={(e) =>
            persist({ ...t, fireDanger: (e.target as HTMLSelectElement).value as FireDanger })
          }
        >
          {(['moderate', 'high', 'very high', 'extreme'] as FireDanger[]).map((d) => (
            <option key={d} value={d} selected={d === t.fireDanger}>
              {msg(`fireDanger.${d}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label class="flex items-center justify-between gap-4">
        <span class="text-sm">{msg('settings.lightningFrom')}</span>
        <select
          class="field"
          disabled={!t.enabled.lightning}
          value={t.lightning}
          onChange={(e) =>
            persist({ ...t, lightning: (e.target as HTMLSelectElement).value as LightningBand })
          }
        >
          {(['low', 'moderate', 'high', 'very high', 'extreme'] as LightningBand[]).map((d) => (
            <option key={d} value={d} selected={d === t.lightning}>
              {msg(`lightningBand.${d}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      {num('heatC', msg('settings.heatAbove'), 20, 45, 0.5)}
      {num('windChillC', msg('settings.windChillBelow'), -60, 5, 1)}
      {num('snowDepthM', msg('settings.lyingSnowAbove'), 0.1, 3, 0.1)}
      {num('windKmh', msg('settings.gustsAbove'), 20, 120, 5)}
      {num('rainMm', msg('settings.rainAbove'), 0.5, 20, 0.5)}
    </div>
  )
}
