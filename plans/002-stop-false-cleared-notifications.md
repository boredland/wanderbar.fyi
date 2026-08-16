# Plan 002: Stop passed waypoints from firing false "cleared" notifications

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d5fa8a7..HEAD -- app/lib/sync.ts app/lib/warnings.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-sync-notify-characterization-tests.md
- **Category**: bug
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

As a hiker walks the track, `syncNow` narrows the forecast to the waypoints
still ahead. The warning **diff**, however, still compares against the entire
previously stored warning set — including warnings for waypoints already walked
past.

Those warnings vanish from `next` purely because the hiker moved, not because
the weather changed. `diffWarnings` sees a key present in `prev` and absent from
`next`, and reports it as **cleared**. The lock screen then says conditions have
improved when nothing improved at all.

This is the worst direction for this app to be wrong in: a false all-clear.
Walking *towards* a storm can produce a notification saying a warning lifted,
simply because a different, earlier waypoint dropped out of scope.

## Current state

Files:

- `app/lib/sync.ts` — orchestrates fetch → evaluate → diff → persist. The bug is
  the mismatch between how `next` and `prev` are scoped.
- `app/lib/warnings.ts` — `diffWarnings` is correct in isolation and is **not**
  changed by this plan.

`syncNow` computes the hiker's current position and narrows to the remaining
waypoints (`sync.ts:20-25`):

```ts
  const anchorMs = startAnchorMs(track.waypoints, fix, track.startAt, now)
  const currentSeq = estimatePosition(track.waypoints, fix, track.startAt, now)
  const remaining = track.waypoints.filter((w) => w.seq >= currentSeq)
  if (remaining.length === 0) {
    await set('forecast', null)
    return EMPTY
  }
```

`next` is evaluated with that `currentSeq`, so it only ever contains warnings
for waypoints at or ahead of the hiker (`sync.ts:74-82`):

```ts
    const next = evaluateWarnings(
      thresholds,
      waypoints,
      track.waypoints,
      currentSeq,
      anchorMs,
      metExtras,
      fwiByDate
    )
```

But `prev` is read back unfiltered — the whole stored set, including warnings
for waypoints now behind the hiker (`sync.ts:93-94`):

```ts
    const prev = (await get('forecast'))?.warnings ?? []
    const delta = diffWarnings(prev, next)
```

`diffWarnings` then reports every `prev` key missing from `next` as cleared
(`warnings.ts:358-381`):

```ts
export function diffWarnings(prev: Warning[], next: Warning[]): Delta {
  const key = (w: Warning) => `${w.seq}:${w.condition}`
  const prevKeys = new Set(prev.map(key))
  const nextKeys = new Set(next.map(key))
  ...
  seen.clear()
  const cleared: Warning[] = []
  for (const w of prev) {
    const k = key(w)
    if (!nextKeys.has(k) && !seen.has(k)) {
      seen.add(k)
      cleared.push(w)
    }
  }
  return { worsened, cleared }
}
```

Worked example: at `currentSeq = 0` a rain warning exists at `seq 3`. The hiker
walks on; the next sync runs with `currentSeq = 5`. `next` cannot contain
`3:rain` — waypoint 3 is behind them. `prev` still does. Result: a "rain has
cleared" notification, with the rain unchanged.

### Design constraints you must honour

These are documented decisions in `README.md`. Do not change them:

- `diffWarnings` keys on `(seq, condition)` and **never** on `forecastHour`,
  `detail` or `source`. The README: *"the hour drifts every sync and would
  notify every single time."* Do not widen or narrow that key.
- Unchanged weather must produce an empty delta. The app deliberately notifies
  only on change; notifying more often is described in the README as
  "lock-screen spam" and is explicitly rejected.
- A warning genuinely disappearing from a waypoint that is **still ahead** must
  still report as cleared. Do not suppress real clearing.

### Conventions to match

`app/lib/warnings.test.ts` is the exemplar for tests — see its `wp` and `hour`
factories and its behaviour-sentence test names. Comments in this repo explain
*why*, not *what*; match that when annotating the fix.

## Commands you will need

| Purpose   | Command                                 | Expected on success |
|-----------|-----------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                      | exit 0, no output   |
| Tests     | `npm test`                              | all pass            |
| One file  | `npx vitest run app/lib/sync.test.ts`   | all pass            |

## Scope

**In scope**:

- `app/lib/sync.ts` — the diff input scoping only
- `app/lib/sync.test.ts` — created by plan 001; add cases here

**Out of scope** (do NOT touch):

- `app/lib/warnings.ts` — `diffWarnings` is correct; the bug is its caller.
  Changing the diff would affect every other caller and risks the
  documented `(seq, condition)` key.
- `app/lib/notify.ts` — notification text is downstream and unaffected.
- `app/sw/index.ts` — calls `syncNow` and inherits the fix for free.
- The stored `Forecast.warnings` shape — other readers depend on it, and it
  must keep holding the full evaluated set for the remaining track.

## Git workflow

- Branch: `advisor/002-stop-false-cleared-notifications`
- Commit message style, from `git log`: an imperative sentence describing the
  effect, e.g. `Discard a clearing the hiker only walked past`. Do **not** add
  `Co-Authored-By` or any attribution line.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing test first

In `app/lib/sync.test.ts` (created by plan 001), add a case to the existing
suite:

- Store a forecast whose `warnings` include a warning at a low `seq` (say
  `seq 1`) and one at a high `seq` (say `seq 8`).
- Arrange the track and fix so the next `syncNow()` runs with a `currentSeq`
  past the low one (e.g. `currentSeq = 5`), with the mocked weather producing
  the **same** warning at `seq 8` and nothing new.
- Assert `delta.cleared` is empty: the `seq 1` warning was walked past, not
  cleared.

Name it as a behaviour sentence, e.g.
`'does not report a warning as cleared just because it was walked past'`.

**Verify**: `npx vitest run app/lib/sync.test.ts` → this new test **fails**,
every other test passes. A failing test here is the point; if it passes, the
bug is not reproduced and you must STOP.

### Step 2: Scope `prev` to the waypoints still ahead

In `app/lib/sync.ts`, filter the previously stored warnings to the same window
`next` was evaluated over, before diffing. The comparison must be like-for-like:
both sides scoped to `seq >= currentSeq`.

Add a short comment explaining *why*, in the style of the surrounding code —
something to the effect that a warning leaving the window because the hiker
advanced is not a warning that cleared, and reporting it as one is a false
all-clear.

Do not change what is **persisted**: `set('forecast', { ... warnings: next })`
stays exactly as it is. Only the diff input changes.

**Verify**: `npx vitest run app/lib/sync.test.ts` → all pass, including the new
test from step 1.

### Step 3: Confirm real clearing still reports

Add a second case asserting the fix did not over-correct:

- A warning at a `seq` **at or ahead of** `currentSeq` that is present in the
  stored forecast and absent from the fresh evaluation **must** appear in
  `delta.cleared`.

This is the guard against "fixing" the bug by suppressing clearing altogether.

**Verify**: `npx vitest run app/lib/sync.test.ts` → all pass.

### Step 4: Full suite

**Verify**: `npx tsc --noEmit` → exit 0.

**Verify**: `npm test` → all pass, count higher than after plan 001.

## Test plan

New tests in `app/lib/sync.test.ts`:

- A warning at a waypoint now behind the hiker is **not** reported as cleared.
- A warning at a waypoint still ahead that genuinely disappeared **is**
  reported as cleared.
- Unchanged weather across two syncs still yields an empty delta (already
  written in plan 001 — confirm it still passes).

Structural pattern: `app/lib/warnings.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0, with more tests than after plan 001
- [ ] `app/lib/sync.test.ts` contains a test asserting a walked-past warning is
      not reported as cleared, and it passes
- [ ] `app/lib/sync.test.ts` contains a test asserting genuine clearing still
      reports, and it passes
- [ ] `git diff --name-only` lists only `app/lib/sync.ts` and
      `app/lib/sync.test.ts`
- [ ] `app/lib/warnings.ts` is unmodified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The step 1 test passes before the fix — the bug is not reproduced as
  described and the analysis needs revisiting.
- The excerpts in "Current state" do not match the live code.
- The fix appears to require editing `app/lib/warnings.ts` or changing the
  `(seq, condition)` diff key.
- Any existing test in `app/lib/warnings.test.ts` starts failing — that
  indicates the change reached further than intended.
- `plans/001-*.md` has not landed: `app/lib/sync.test.ts` does not exist. Do
  not write the sync test harness from scratch here; report the missing
  dependency.

## Maintenance notes

- The invariant to preserve: **`prev` and `next` must always be scoped
  identically before `diffWarnings` sees them.** Any future change to how
  `next` is windowed (a different position estimate, a look-ahead limit) has to
  apply the same window to `prev`, or this bug returns in a new form.
- A reviewer should check that the persisted `Forecast.warnings` is still the
  unfiltered evaluated set for the remaining track — the fix belongs at the
  diff, not at persistence.
- Deferred: warnings for waypoints behind the hiker accumulate in storage
  across syncs and are never pruned. Harmless once the diff is scoped, and
  pruning them would lose the record of what was warned earlier on the walk.
