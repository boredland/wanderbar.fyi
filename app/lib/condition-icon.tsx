import type { Condition } from './warnings'

/**
 * Warning icons as inline SVG rather than emoji: emoji render differently on
 * every platform, cannot inherit colour, and cannot be sized from a token.
 * Single stroke width (1.75), single 24px grid, so they read as one family.
 */
const PATHS: Record<Condition, string> = {
  rain: 'M7 16.5a4.5 4.5 0 0 1 .5-8.96 5.5 5.5 0 0 1 10.6 1.51A3.75 3.75 0 0 1 17.5 16.5M8 19l-1 2M12 19l-1 2M16 19l-1 2',
  hail: 'M7 15.5a4.5 4.5 0 0 1 .5-8.96 5.5 5.5 0 0 1 10.6 1.51A3.75 3.75 0 0 1 17.5 15.5M8.5 19h.01M12 20.5h.01M15.5 19h.01',
  wind: 'M3 8h9a2.5 2.5 0 1 0-2.5-2.5M3 12h13a2.5 2.5 0 1 1-2.5 2.5M3 16h7a2.5 2.5 0 1 1-2.5 2.5',
  snow: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 7l2.5-2.5M12 7L9.5 4.5M12 17l2.5 2.5M12 17l-2.5 2.5',
  heat: 'M12 15.5V4.5a2 2 0 0 1 4 0v11a4 4 0 1 1-4 0zM8 8H3M8 12H4M8 16H3',
  blizzard: 'M3 7h9a2.5 2.5 0 1 0-2.5-2.5M3 11h13a2.5 2.5 0 1 1-2.5 2.5M7 16l-1 2M11 16l-1 2M15 16l-1 2M19 16l-1 2',
  thunderstorm: 'M7 15.5a4.5 4.5 0 0 1 .5-8.96 5.5 5.5 0 0 1 10.6 1.51A3.75 3.75 0 0 1 17.5 15.5M13 13l-3 4.5h3.5L11 22',
  darkness: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  fire: 'M12 22a6 6 0 0 0 6-6c0-4-3-5.5-3-9.5C12.5 8 12 10 12 10s-1-1.5-1-4c-2 1.5-5 4-5 10a6 6 0 0 0 6 6z'
}

/** Inherits currentColor and font-size, so it themes with the text around it. */
export function ConditionIcon(props: { condition: Condition; size?: number; class?: string }) {
  const size = props.size ?? 20
  return (
    <svg
      class={props.class}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[props.condition]} />
    </svg>
  )
}

/** For contexts that need raw markup, e.g. Leaflet divIcon HTML. */
export function conditionIconHtml(condition: Condition, size = 16): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[condition]}"/></svg>`
  )
}
