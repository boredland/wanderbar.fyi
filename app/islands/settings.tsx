import { useCallback, useEffect, useState } from 'hono/jsx'
import { conditionLabel } from '../lib/icons'
import { notifyDelta } from '../lib/notify'
import { get, set } from '../lib/store'
import { syncNow } from '../lib/sync'
import type { FireDanger } from '../lib/fwi'
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
  'fire'
]

export default function Settings() {
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

  const num = (key: 'heatC' | 'windKmh' | 'rainMm', label: string, min: number, max: number, step: number) => (
    <label class="flex items-center justify-between gap-4">
      <span class="text-[14px]">{label}</span>
      <input
        type="number"
        class="field figures w-28"
        min={min}
        max={max}
        step={step}
        value={t[key]}
        disabled={key === 'heatC' && !t.enabled.heat}
        onChange={(e) => persist({ ...t, [key]: Number((e.target as HTMLInputElement).value) })}
      />
    </label>
  )

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
          <span class="text-[16px]">{conditionLabel[c]}</span>
        </label>
      ))}
      <label class="flex items-center justify-between gap-4">
        <span class="text-[14px]">Fire danger from</span>
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
              {d}
            </option>
          ))}
        </select>
      </label>
      {num('heatC', 'Heat above (°C)', 20, 45, 0.5)}
      {num('windKmh', 'Gusts above (km/h)', 20, 120, 5)}
      {num('rainMm', 'Rain above (mm/h)', 0.5, 20, 0.5)}
    </div>
  )
}
