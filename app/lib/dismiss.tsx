import { useCallback, useEffect, useState } from 'hono/jsx'

/**
 * Notices the reader has hidden.
 *
 * localStorage rather than the IndexedDB in `store.ts`: this is per-device
 * chrome preference, not track data, and it must be readable synchronously
 * during hydration so a hidden notice does not linger for a frame after the
 * rest of the page is live.
 *
 * Hiding is always the reader's own act. Nothing here hides itself, and a
 * notice that carries an actual danger level is never given the control in the
 * first place.
 */
const PREFIX = 'wanderbar:hidden:'

export type HiddenKey = 'best-effort' | 'avalanche-unknown'

export function useHidden(key: HiddenKey): [boolean, () => void] {
  /*
   * Starts visible on both server and first client render, so the markup
   * matches and hydration has nothing to correct. A safety notice flashing
   * once before it is hidden is the right way round; the reverse would hide it
   * from someone who never chose that.
   */
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(PREFIX + key) === '1') setHidden(true)
    } catch {
      // Storage blocked or full: the notice stays visible, which is the safe way to fail.
    }
  }, [key])

  const hide = useCallback(() => {
    setHidden(true)
    try {
      localStorage.setItem(PREFIX + key, '1')
    } catch {
      // Hidden for this view only; it returns on reload rather than the click doing nothing.
    }
  }, [key])

  return [hidden, hide]
}

/** The control itself, so both notices dismiss the same way and read the same. */
export function HideButton(props: { onHide: () => void; label: string }) {
  return (
    <button type="button" class="notice-hide" onClick={props.onHide} aria-label={props.label}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  )
}
