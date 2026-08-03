import { useEffect, useRef } from 'hono/jsx'
import { conditionIconHtml } from '../lib/condition-icon'
import { conditionLabel, isDayHour, wmoIcon } from '../lib/icons'
import type { Forecast } from '../lib/store'
import type { Waypoint } from '../lib/track'
import type { Warning } from '../lib/warnings'
import type { Hour } from '../lib/weather'

// A licence obligation, not decoration; do not shorten.
const ATTRIBUTION =
  'Kartendaten: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>, SRTM | Kartendarstellung: © <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'

// Route orange is a fill, never text: it is the app's mark and the line you
// have left to walk. Behind you goes to the sheet's own contour grey.
const BEHIND = '#c9cfc2'
const AHEAD = '#f97316'
const WARN = '#a32118'
const PAPER = '#f6f7f3'

type Props = {
  simplified: [number, number][]
  bbox: [number, number, number, number]
  remaining: Waypoint[]
  currentSeq: number
  warningsBySeq: Record<number, Warning[]>
  forecast: Forecast | null
  anchorMs: number
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

      // Keyboard users tabbed into the map before reaching any control, then
      // spent 13 stops on markers. Popups stay reachable from the timeline.
      const map = L.map(el.current, { keyboard: false })
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
        const at = props.anchorMs + wp.etaOffsetS * 1000
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
          ? `<span style="position:absolute;right:-7px;top:-7px;display:flex;` +
            `align-items:center;justify-content:center;width:18px;height:18px;` +
            `border-radius:999px;background:${WARN};color:${PAPER};box-shadow:0 0 0 2px ${PAPER}">` +
            `${conditionIconHtml(ws[0].condition, 11)}</span>`
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

        // keyboard:false does not stop Leaflet giving every marker tabindex=0,
        // which put 14 unlabelled stops in the tab order duplicating the
        // timeline. The map is confirmation; the timeline is the content.
        L.marker([wp.lat, wp.lon], { icon, keyboard: false })
          .addTo(map)
          .bindPopup(lines.join('<br>'))
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
      <div class="h-80 w-full rounded-[10px] border border-line bg-raised p-4 text-muted">
        Track too short to map.
      </div>
    )
  }
  return (
    <div ref={el} tabIndex={-1} class="h-80 w-full rounded-[10px] border border-line" />
  )
}
