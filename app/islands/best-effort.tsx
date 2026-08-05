import { HideButton, useHidden } from '../lib/dismiss'

/**
 * The best-effort caveat, above the forecast.
 *
 * An island only so it can be dismissed. It is the frame the whole page is
 * read through, so it is stated once and stated first; hiding it is the
 * reader's choice on their own device, not something the page decides.
 */
export default function BestEffort() {
  const [hidden, hide] = useHidden('best-effort')
  if (hidden) return null

  return (
    <p class="notice notice-high text-sm">
      <HideButton onHide={hide} label="Hide the best-effort notice" />
      <span>
        <strong class="font-medium text-ink">This is a best-effort forecast.</strong> The data
        comes from public models and can be wrong, late or missing, and mountain weather turns
        faster than any forecast follows. Always check local sources too where you can: the local
        avalanche or weather service, the hut warden, the valley station. Treat wanderbar as one
        input to your own judgement, never as a reason to set out.
      </span>
    </p>
  )
}
