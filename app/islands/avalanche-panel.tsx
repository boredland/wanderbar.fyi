import { DANGER_LABEL, type Bulletin, type DangerLevel } from '../lib/avalanche'

/**
 * The avalanche bulletin, deliberately its own panel rather than a row in the
 * timeline.
 *
 * Everything else on this page is a forecast wanderbar evaluated, where nothing
 * shown means nothing expected. This panel is a relay of somebody else's
 * official document, and the honest answer is very often "we do not know". A
 * timeline row cannot say that: an empty timeline reads as the green all-clear
 * verdict, which on a loaded slope is the most dangerous sentence this app
 * could print. So every state below says what is and is not known, in words.
 *
 * It never claims a route is safe, only ever what the bulletin says, and always
 * points at the real bulletin, which is the document that actually governs the
 * decision.
 */
export default function AvalanchePanel(props: { bulletin: Bulletin | null }) {
  const b = props.bulletin
  if (!b) return null

  const link = b.providerUrl ? (
    <a class="underline" href={b.providerUrl} target="_blank" rel="noopener noreferrer">
      {b.provider || 'the official bulletin'}
    </a>
  ) : null

  if (b.status !== 'ok') {
    return (
      <section class="bulletin bulletin-unknown">
        <p class="eyebrow">Avalanche</p>
        <p class="text-base font-semibold">{HEADLINE[b.status]}</p>
        <p class="text-sm text-muted">
          {BODY[b.status]}
          {link ? <> Check {link} yourself.</> : null}
        </p>
      </section>
    )
  }

  const level = b.level as DangerLevel
  return (
    <section class={`bulletin ${level >= 3 ? 'bulletin-high' : 'bulletin-known'}`}>
      <p class="eyebrow">Avalanche</p>
      <p class="display text-xl font-bold leading-tight">
        <span class="figures">{level}</span> &mdash; {DANGER_LABEL[level]}
        {b.region ? <span class="text-base font-normal text-muted"> · {b.region}</span> : null}
      </p>
      {b.bands.length > 1 ? (
        <p class="text-sm text-muted">
          {b.bands.map((x, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : ''}
              {x.aboveM !== null
                ? `above ${x.aboveM} m`
                : x.belowM !== null
                  ? `below ${x.belowM} m`
                  : 'overall'}
              : {DANGER_LABEL[x.level]}
            </span>
          ))}
        </p>
      ) : null}
      {b.problems.length > 0 ? (
        <p class="text-sm text-muted">{b.problems.join(' · ')}</p>
      ) : null}
      {b.headline ? <p class="text-sm">{b.headline}</p> : null}
      {/*
        * Level alone is not a decision. The bulletin knows the snowpack; it does
        * not know which slope you will stand on, and neither does wanderbar.
        */}
      <p class="text-sm text-muted">
        Danger varies by slope angle and aspect, which wanderbar does not know.
        {link ? <> Read {link} before you go.</> : null}
      </p>
    </section>
  )
}

/** Each non-answer says plainly that it is not an all-clear. */
const HEADLINE: Record<string, string> = {
  'no-coverage': 'No avalanche bulletin covers this route',
  'out-of-season': 'No bulletin published right now',
  stale: 'The bulletin we found is out of date',
  error: 'Could not reach the avalanche service'
}

const BODY: Record<string, string> = {
  'no-coverage':
    'wanderbar has no official source for this area, so it cannot tell you anything about avalanche danger. That is not the same as safe.',
  'out-of-season':
    'The service covering this area is not publishing today, which is normal outside winter. Snow can still slide, and this is not an all-clear.',
  stale:
    'It is outside its validity window, so it describes past snow, not today. wanderbar will not show an out-of-date danger level.',
  error:
    'This may just be a dropped connection. wanderbar has no danger level for this route, which is not the same as no danger.'
}
