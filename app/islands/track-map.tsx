import { useEffect, useRef } from 'hono/jsx'
import { conditionGlyph, conditionLabel, isDayHour, wmoIcon } from '../lib/icons'
import type { Forecast } from '../lib/store'
import type { Waypoint } from '../lib/track'
import type { Warning } from '../lib/warnings'
import type { Hour } from '../lib/weather'

// A licence obligation, not decoration; do not shorten.
const ATTRIBUTION =
  'Kartendaten: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>, SRTM | Kartendarstellung: © <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'

const BEHIND = '#9ca3af'
const AHEAD = '#f97316'
const WARN = '#b91c1c'

type Props = {
  simplified: [number, number][]
  bbox: [number, number, number, number]
  remaining: Waypoint[]
  currentSeq: number
  warningsBySeq: Record<number, Warning[]>
  forecast: Forecast | null
  now: number
  baseEta: number
}

export default function TrackMap(props: Props) {
  const el = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    if (!el.current || mapRef.current) return
    let cancelled = false
    let created: { remove: () => void } | null = null

    ;(async () => {
      // Exception to the static-import rule: Leaflet dereferences `window` at
      // module scope, and this island module is also evaluated during SSR,
      // where that throws. It can only be loaded once we are in the browser.
      await import('leaflet/dist/leaflet.css')
      const L = (await import('leaflet')).default
      if (cancelled || !el.current) return

      const map = L.map(el.current)
      created = map
      mapRef.current = map

      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        maxZoom: 17,
        attribution: ATTRIBUTION
      }).addTo(map)

      const cut = props.simplified.length
        ? Math.min(
            props.simplified.length - 1,
            Math.round(
              (props.currentSeq / Math.max(1, props.remaining[props.remaining.length - 1]?.seq ?? 1)) *
                (props.simplified.length - 1)
            )
          )
        : 0
      if (cut > 0) {
        L.polyline(props.simplified.slice(0, cut + 1), { color: BEHIND, weight: 4 }).addTo(map)
      }
      L.polyline(props.simplified.slice(cut), { color: AHEAD, weight: 4 }).addTo(map)

      const hoursBySeq: Record<number, Hour[]> = {}
      for (const wf of props.forecast?.waypoints ?? []) hoursBySeq[wf.seq] = wf.hours

      for (const wp of props.remaining) {
        const at = props.now + (wp.etaOffsetS - props.baseEta) * 1000
        const hours = hoursBySeq[wp.seq] ?? []
        let hour: Hour | null = null
        let gap = Infinity
        for (const h of hours) {
          const g = Math.abs(h.t - at)
          if (g < gap) {
            gap = g
            hour = h
          }
        }
        if (gap > 3600_000) hour = null

        const ws = props.warningsBySeq[wp.seq] ?? []
        const ring = ws.length ? `box-shadow:0 0 0 3px ${WARN};border-radius:50%;` : ''
        const badge = ws.length
          ? `<span style="position:absolute;right:-6px;top:-6px;font-size:12px">${
              conditionGlyph[ws[0].condition]
            }</span>`
          : ''
        const icon = L.divIcon({
          className: 'wx-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          html: `<div style="position:relative;${ring}"><img src="${wmoIcon(
            hour?.code ?? null,
            isDayHour(at)
          )}" width="28" height="28" alt="">${badge}</div>`
        })

        const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const lines = [
          `<strong>${time}</strong> · km ${(wp.cumDistM / 1000).toFixed(1)}`,
          hour?.tempC !== null && hour !== null ? `${hour.tempC.toFixed(0)} °C` : null,
          hour?.gustKmh !== null && hour !== null ? `gusts ${Math.round(hour.gustKmh)} km/h` : null,
          ...ws.map((w) => `${conditionLabel[w.condition]} (${w.detail})`)
        ].filter(Boolean)

        L.marker([wp.lat, wp.lon], { icon }).addTo(map).bindPopup(lines.join('<br>'))
      }

      const here = props.remaining[0]
      if (here) {
        L.circleMarker([here.lat, here.lon], { radius: 7, color: AHEAD, fillOpacity: 1 })
          .addTo(map)
          .bindPopup('Estimated position')
      }

      const [minLat, minLon, maxLat, maxLon] = props.bbox
      map.fitBounds(
        [
          [minLat, minLon],
          [maxLat, maxLon]
        ],
        { padding: [20, 20] }
      )
    })()

    return () => {
      cancelled = true
      created?.remove()
      mapRef.current = null
    }
  }, [props.simplified, props.currentSeq, props.forecast])

  if (props.simplified.length < 2) {
    return (
      <div class="h-80 w-full rounded-[12px] bg-[--color-raised] p-4 text-[--color-muted]">
        track too short to map
      </div>
    )
  }
  return <div ref={el} class="h-80 w-full rounded-[12px] shadow-[0_1px_3px_rgb(28_25_23/0.12)]" />
}
