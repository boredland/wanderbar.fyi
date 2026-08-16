# Plan 005: Query every sampled point a provider covers, not just the first

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d5fa8a7..HEAD -- app/lib/avalanche.ts app/lib/avalanche.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/004-avalanche-tests-offline.md
- **Category**: bug
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

`fetchBulletin` samples three points along the track — start, middle, end — and
documents the rule for disagreement:

> *"Where the sampled points disagree — a route crossing a region boundary —
> the higher danger wins, because under-reporting is the direction that gets
> people killed."* (`avalanche.ts:365-369`)

The code does not do that per provider. For each provider it filters the sampled
points to those inside the provider's bounding box, then queries **only
`covered[0]`** and throws the rest away. The "higher danger wins" reduction at
:404-405 therefore only ever compares *across* providers, never *within* one.

Consequence: a route that starts in a quiet region and ends in a loaded one,
both served by the same provider, reports the start's number. A route whose
first sampled point falls in a bbox but outside the provider's actual polygon
returns `no-coverage` even though the midpoint would have answered.

The stated safety rule and the implementation disagree. This plan makes the code
match the documented rule.

## Current state

File: `app/lib/avalanche.ts` — relays official bulletins from four providers.

Sampling and dispatch (`avalanche.ts:375-405`):

```ts
export async function fetchBulletin(
  waypoints: Waypoint[],
  now = Date.now(),
  timeoutMs = 8000
): Promise<Bulletin> {
  if (waypoints.length === 0) return unavailable('no-coverage')

  const idx = [...new Set([0, waypoints.length >> 1, waypoints.length - 1])]
  const points = idx.map((i) => waypoints[i])

  const jobs: Promise<Bulletin>[] = []
  for (const p of PROVIDERS) {
    const covered = points.filter((w) => inBbox(p, w.lat, w.lon))
    if (covered.length === 0) continue
    const w = covered[0]
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    jobs.push(
      p
        .fetch(w.lat, w.lon, ac.signal)
        .catch(() => unavailable('error', p.name, p.url))
        .finally(() => clearTimeout(timer))
    )
  }
  // Nowhere on this track is covered by a service we know how to ask.
  if (jobs.length === 0) return unavailable('no-coverage')

  const results = (await Promise.all(jobs)).map((b) => withFreshness(b, now))
  const live = results.filter((b) => b.status === 'ok')
  if (live.length > 0) {
    return live.reduce((a, b) => ((b.level ?? 0) > (a.level ?? 0) ? b : a))
  }
```

The fallback ordering when no bulletin is live (`avalanche.ts:406-415`):

```ts
  // No number. Report the most informative reason, worst first: a stale
  // bulletin is a stronger signal than silence, and an error is worth showing
  // over "no coverage" because it may simply be a dropped connection.
  const order: BulletinStatus[] = ['stale', 'error', 'out-of-season', 'no-coverage']
  for (const s of order) {
    const hit = results.find((b) => b.status === s)
    if (hit) return hit
  }
  return unavailable('no-coverage')
```

`PROVIDERS` and the bbox test (`avalanche.ts:357-360`):

```ts
const PROVIDERS: Provider[] = [NVE, SLF, ALBINA, AVCAN]

const inBbox = (p: Provider, lat: number, lon: number) =>
  lat >= p.bbox[0] && lat <= p.bbox[2] && lon >= p.bbox[1] && lon <= p.bbox[3]
```

### The cost this must respect

The same doc comment gives the reason the sampling is sparse at all:

> *"Sampled at a few points rather than all sixty: a bulletin is regional, and
> sixty lookups would hammer four public services to re-derive one number."*

At most three sampled points exist (`idx` is a de-duplicated set of three
indices), so the worst case after this change is three requests per covered
provider instead of one — bounded and small. **Do not increase the sample
count** beyond the existing three points. This plan changes *which of the
already-sampled points get queried*, nothing else.

De-duplicate identical coordinates before dispatching: a short track can
collapse start/middle/end onto the same point, and issuing three identical
requests would waste the very budget the sampling exists to protect.

### Design constraints you must honour

From `README.md` and the module header (`avalanche.ts:3-28`):

- This module only ever **relays** a bulletin, never derives one. Merging two
  bulletins into a synthesised one is forbidden — pick the higher-danger
  bulletin whole, do not blend fields from two.
- The function must never return "safe". Every non-answer stays an explicit
  `BulletinStatus` the UI renders as *unknown*.
- Under-reporting is the fatal direction. When in doubt, the higher danger wins.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                           | exit 0, no output   |
| Tests     | `npm test`                                   | all pass            |
| One file  | `npx vitest run app/lib/avalanche.test.ts`   | all pass            |

## Scope

**In scope**:

- `app/lib/avalanche.ts` — `fetchBulletin` dispatch loop only
- `app/lib/avalanche.test.ts` — add tests

**Out of scope** (do NOT touch):

- The `idx`/`points` sampling itself — three points is a deliberate budget
  decision. Do not sample more waypoints.
- The individual providers (`NVE`, `SLF`, `ALBINA`, `AVCAN`) and their
  `fetch` implementations.
- `withFreshness`, `inBbox`, `inGeometry`, `readCaaml`.
- The `order` fallback array and its rationale.
- `app/lib/sync.ts` — calls `fetchBulletin(remaining)` and needs no change.

## Git workflow

- Branch: `advisor/005-sample-every-covered-point`
- Commit message style, from `git log`: an imperative sentence describing the
  effect, e.g. `Ask every point a service covers, not just the first`. Do
  **not** add `Co-Authored-By` or any attribution line.
- Do NOT push or open a PR.

## Steps

### Step 1: Confirm the test harness is offline

This plan depends on plan 004, which replaces the live-network tests in
`app/lib/avalanche.test.ts` with a stubbed `fetch`. You need that stub to assert
how many requests are issued and with which coordinates.

**Verify**: `npx vitest run app/lib/avalanche.test.ts` → all pass, and the run
completes in well under a second with no network access. If the file still
contains a test with a `30000` timeout calling real providers, plan 004 has not
landed — STOP and report.

### Step 2: Write the failing tests

With the `fetch` stub from plan 004, add cases to `app/lib/avalanche.test.ts`:

1. **Within-provider disagreement.** A track whose three sampled points all sit
   in one provider's bbox, where the stub returns different danger levels per
   coordinate. Assert the returned bulletin is the **highest** of them, and that
   it is one provider's bulletin returned whole (its `region`/`providerUrl`
   belong to the point that produced the highest level — not a mixture).
2. **First point outside the polygon.** The stub returns `no-coverage` for the
   first sampled coordinate and a live bulletin for a later one. Assert the
   result is the live bulletin, not `no-coverage`.
3. **De-duplication.** A track where all three sampled indices resolve to the
   same coordinate issues exactly **one** request to that provider (assert the
   stub's call count).

**Verify**: `npx vitest run app/lib/avalanche.test.ts` → cases 1 and 2 **fail**,
case 3 passes. Failing here is the point. If case 1 or 2 passes already, STOP —
the bug is not reproduced as described.

### Step 3: Dispatch one job per distinct covered point

In the `fetchBulletin` loop, replace the single `covered[0]` dispatch with one
job per **distinct** covered coordinate for that provider:

- De-duplicate on the coordinate pair before dispatching.
- Give each request its own `AbortController` and its own timer, cleared in
  `finally` exactly as the current code does — do not share one controller
  across requests, or one slow provider aborts another's request.
- Keep the per-request `.catch(() => unavailable('error', p.name, p.url))` so a
  single failure still degrades to an explicit non-answer rather than rejecting
  the whole `Promise.all`.

The existing reduction at :402-405 then does the right thing without change: it
already takes the highest `level` across all results, and now the results
include every covered point. Do not modify that reduction, and do not
special-case "same provider" in it — a whole bulletin is still returned whole.

Update the doc comment at :365-369 only if its wording no longer matches; the
stated rule itself is now finally true, so it likely needs no edit.

**Verify**: `npx vitest run app/lib/avalanche.test.ts` → all pass, including
cases 1 and 2 from step 2.

### Step 4: Confirm the non-answer paths are unchanged

The existing tests in `describe('never implies safety')` and
`describe('withFreshness')` must still pass unchanged — in particular that an
empty track and an uncovered location both return `no-coverage` with a null
level.

**Verify**: `npx vitest run app/lib/avalanche.test.ts -t 'never implies safety'`
→ passes.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all pass.

## Test plan

New tests in `app/lib/avalanche.test.ts`:

- Highest danger wins among several covered points of the **same** provider.
- A later sampled point answers when the first returns `no-coverage`.
- Identical sampled coordinates issue exactly one request.
- Request count is bounded: at most three per covered provider.

Existing tests that must keep passing: the whole `never implies safety` block,
and `withFreshness`.

Structural pattern: the stubbed-`fetch` tests introduced by plan 004 in the same
file.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with more tests than before
- [ ] `grep -n "covered\[0\]" app/lib/avalanche.ts` returns nothing
- [ ] A test asserts the highest danger wins **within** one provider, and passes
- [ ] A test asserts identical sampled coordinates issue exactly one request,
      and passes
- [ ] No test in the suite performs a real network request
- [ ] `git diff --name-only` lists only `app/lib/avalanche.ts` and
      `app/lib/avalanche.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `app/lib/avalanche.test.ts` still makes live network calls (plan 004 has not
  landed).
- The excerpts in "Current state" do not match the live code.
- The change would issue more than three requests per provider, or you find
  yourself widening the `idx` sample.
- Any change appears to require merging fields from two bulletins into one —
  that is explicitly forbidden; a bulletin is relayed whole.
- The existing `never implies safety` tests start failing.

## Maintenance notes

- The request budget is the constraint to watch: three sampled points × four
  providers is the ceiling, and only providers whose bbox contains a sampled
  point are queried at all. Any future addition of a provider or a sampled
  point multiplies against this.
- A reviewer should check each dispatched request still has its **own**
  `AbortController` and that every timer is cleared in `finally` — a shared
  controller or a leaked timer is the likely regression here.
- Bounding boxes are coarse (ALBINA's is documented at `avalanche.ts:311-319`
  as bbox-only because bundling EAWS region polygons would rot). Querying every
  covered point makes the app more tolerant of that coarseness, which is part
  of the point.
- Deferred: results from several points of one provider are not de-duplicated
  by region. If two sampled points fall in the same region, the provider is
  asked twice and returns the same bulletin. Harmless, and avoiding it would
  require knowing region membership before the request.
