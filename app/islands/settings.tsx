import { useCallback, useEffect, useState } from 'hono/jsx'
import { conditionLabel } from '../lib/icons'
import { notifyDelta } from '../lib/notify'
import { get, set } from '../lib/store'
import { syncNow } from '../lib/sync'
import { DEFAULT_THRESHOLDS, type Condition, type Thresholds } from '../lib/warnings'

const CONDITIONS: Condition[] = [
  'rain',
  'hail',
  'wind',
  'snow',
  'heat',
  'blizzard',
  'thunderstorm'
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
        class="figures min-h-[44px] w-28 rounded-[6px] border border-[--color-line] px-3"
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
        <label key={c} class="flex min-h-[44px] items-center gap-3">
          <input
            type="checkbox"
            class="h-5 w-5"
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
      {num('heatC', 'Heat above (°C)', 20, 45, 0.5)}
      {num('windKmh', 'Gusts above (km/h)', 20, 120, 5)}
      {num('rainMm', 'Rain above (mm/h)', 0.5, 20, 0.5)}
    </div>
  )
}
