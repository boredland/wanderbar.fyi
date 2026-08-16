# Plan 001: Cover the sync → diff → notify path with characterization tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d5fa8a7..HEAD -- app/lib/sync.ts app/lib/notify.ts app/lib/store.ts app/lib/warnings.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

wanderbar exists to notify a hiker when mountain weather worsens. That entire
path — `syncNow()` fetches, `diffWarnings()` compares against the stored
forecast, `notifyDelta()` builds the lock-screen text — has **zero** test
coverage today. `app/lib/notify.test.ts` exists but tests only i18n string
helpers; it never calls `notifyDelta`. `app/lib/sync.ts` and `app/lib/store.ts`
have no test file at all.

Plan 002 changes the diff semantics in `sync.ts` and plan 006 removes an
argument from `notifyDelta`. Both are edits to code that nothing currently
verifies. This plan lays down the characterization tests those plans need, so a
regression in the notify path fails a test instead of failing silently on a
mountain.

This plan **only adds tests**. It must not change any behaviour.

## Current state

Files:

- `app/lib/sync.ts` — orchestrates fetch → evaluate → diff → persist. No tests.
- `app/lib/store.ts` — the only IndexedDB access, imported by page *and*
  service worker. No tests.
- `app/lib/notify.ts` — builds and shows the notification. No tests.
- `app/lib/notify.test.ts` — exists, but covers `detailText`/`plural` from
  `./i18n` only.
- `app/lib/warnings.test.ts` — 555 lines, the exemplar for test style.

`syncNow` persists through `store.ts`, so testing it requires an IndexedDB
implementation. `store.ts:100-116` opens the database lazily and memoises the
promise in a module-level `dbPromise`:

```ts
// app/lib/store.ts:100-116
let dbPromise: Promise<IDBDatabase> | null = null

// No window/document references: the service worker imports this module and
// shares the page's origin-scoped database.
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    dbPromise = promise
  }
  return dbPromise
}
```

`get()` applies defaults and back-fills fields on older records
(`store.ts:130-155`), which is behaviour worth pinning:

```ts
// app/lib/store.ts:130-146
export async function get<K extends keyof Stored>(k: K): Promise<Stored[K]> {
  const v = await tx<Stored[K] | undefined>('readonly', (s) => s.get(k))
  if (v === undefined) return DEFAULTS[k]
  // Tracks stored before a field existed still have to render.
  if (k === 'track' && v !== null) {
    const t = v as Track
    return {
      ...t,
      rest: t.rest ?? DEFAULT_REST,
      startAt: t.startAt ?? null,
      // Tracks stored before descent was measured: 0 reads as "not known"
      // rather than fabricating a figure from resampled waypoints.
      descentM: t.descentM ?? 0
    } as Stored[K]
  }
```

`syncNow` guards against the track being swapped mid-fetch
(`sync.ts:84-91`) — this is the subtlest behaviour in the file and the one
most worth pinning:

```ts
// app/lib/sync.ts:84-94
    const current = await get('track')
    // startAt too, not just identity: changing the planned start re-runs this,
    // and two runs can land out of order and store the older answer.
    if (!current || current.addedAt !== track.addedAt || current.startAt !== track.startAt) {
      return EMPTY
    }

    const prev = (await get('forecast'))?.warnings ?? []
    const delta = diffWarnings(prev, next)
```

And on failure it preserves the previous forecast (`sync.ts:108-114`):

```ts
  } catch (e) {
    // The previous forecast stays: a failed fetch must not blank the screen.
    await set('lastFetchError', {
      at: Date.now(),
      message: e instanceof Error ? e.message : String(e)
    })
    throw e
  }
```

`notifyDelta` returns early when nothing changed, and caps the body at three
warnings (`notify.ts:53-81`):

```ts
// app/lib/notify.ts:53-58
  delta: Delta,
  kmBySeq: Record<number, number> = {}
): Promise<void> {
  // No change is the common case and the entire point of the diff.
  if (delta.worsened.length === 0 && delta.cleared.length === 0) return
```

### Conventions to match

Follow `app/lib/warnings.test.ts`. Its shape:

```ts
// app/lib/warnings.test.ts:1-27
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  diffWarnings,
  evaluateWarnings,
  windChillC,
  type Condition,
  type Thresholds,
  type Warning
} from './warnings'
...
const NOW = 1_800_000_000_000

const wp = (seq: number, etaOffsetS: number): Waypoint => ({
  seq,
  lat: 47.42,
  lon: 10.98,
  eleM: 1200,
  cumDistM: seq * 2000,
  cumAscentM: 0,
  etaOffsetS
})
```

House style, observed across the suite:

- Named factory helpers (`wp`, `hour`, `thresholds`) with `Partial<T>` overrides.
- A fixed `NOW` constant, never `Date.now()` in an assertion.
- Test names are sentences describing behaviour: *"treats a missing snow depth
  as unknown rather than zero"*, not *"test snowDepth null"*.
- Comments explain **why** a case matters, especially safety reasoning.
- No mocking framework is in use anywhere in this repo today. Prefer
  dependency-free tests; where a global must be replaced, assign it directly
  and restore it in `afterEach`.

## Commands you will need

| Purpose   | Command                              | Expected on success        |
|-----------|--------------------------------------|----------------------------|
| Install   | `npm install`                        | exit 0                     |
| Typecheck | `npx tsc --noEmit`                   | exit 0, no output          |
| Tests     | `npm test`                           | all pass (206 before this plan) |
| One file  | `npx vitest run app/lib/sync.test.ts`| all pass                   |

## Scope

**In scope** (the only files you may modify or create):

- `app/lib/store.test.ts` (create)
- `app/lib/sync.test.ts` (create)
- `app/lib/notify.test.ts` (extend — keep every existing test in it)
- `package.json` (only to add the `fake-indexeddb` devDependency in step 1)

**Out of scope** (do NOT touch):

- `app/lib/sync.ts`, `app/lib/store.ts`, `app/lib/notify.ts`,
  `app/lib/warnings.ts` — this plan adds tests only. If a test you write fails
  because the code has a bug, that is expected: plan 002 fixes one such bug.
  Write the test to describe **current** behaviour and mark it as noted in
  step 4. Do not fix production code here.
- `app/islands/**` and `app/sw/index.ts` — call sites, not the logic under test.
- Any existing test file other than `notify.test.ts`.

## Git workflow

- Branch: `advisor/001-sync-notify-characterization-tests`
- Commit per step. Message style, from `git log`: a lowercase-after-first-word
  imperative sentence describing the effect, e.g. `Cover the sync path with
  characterization tests`. Do **not** add `Co-Authored-By` or any attribution
  line.
- Do NOT push or open a PR.

## Steps

### Step 1: Add an in-memory IndexedDB for tests

`store.ts` calls the global `indexedDB`, which does not exist in Vitest's
default Node environment. Add `fake-indexeddb` as a devDependency:

```bash
npm install --save-dev --save-exact fake-indexeddb
```

Do not add any other dependency. Do not change any existing dependency version.

**Verify**: `node -e "console.log(require('./package.json').devDependencies['fake-indexeddb'])"`
→ prints a version string, not `undefined`.

**Verify**: `npm test` → still all pass (no test uses it yet).

### Step 2: Pin `store.ts` behaviour

Create `app/lib/store.test.ts`. Import the fake IndexedDB **before** importing
`./store`, because `store.ts` reads the global when first called:

```ts
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearTrack, get, set } from './store'
```

Cover exactly these cases:

1. `get` on an untouched key returns the documented default — check
   `thresholds` returns `DEFAULT_THRESHOLDS` and `track` returns `null`.
2. `set` then `get` round-trips a value unchanged.
3. A `track` record missing `rest`, `startAt` and `descentM` (write it with
   `set('track', partial as never)`) comes back with `rest === DEFAULT_REST`,
   `startAt === null`, `descentM === 0`. This is the back-fill at
   `store.ts:134-144` and it is what stops an older stored track from crashing
   the page.
4. A `thresholds` record missing a key in `enabled` comes back with the
   default merged in, not with the key absent (`store.ts:147-154`).
5. `clearTrack()` nulls `track`, `fix`, `forecast` and `lastFetchError` but
   leaves `thresholds`, `schedule` and `locale` untouched — that split is the
   documented contract on `clearTrack`.

**Verify**: `npx vitest run app/lib/store.test.ts` → all pass.

### Step 3: Pin `syncNow` orchestration

Create `app/lib/sync.test.ts`. `syncNow` calls the network through
`fetchOpenMeteo`, `fetchMet`, `fetchFwiInputs`, `fetchBulletin` and
`fetchWildfires`. Use `vi.mock` on those modules — this is the one place
mocking is warranted, because the alternative is a live network call and this
repo already has one test doing that (which plan 005 removes).

Mock `./weather`, `./avalanche` and `./wildfire` at module level. Keep
`./warnings`, `./track` and `./store` **real** — the point is to test the
orchestration against genuine diff and persistence logic, with
`fake-indexeddb/auto` imported first as in step 2.

Cover exactly these cases:

1. **No track stored** → returns `{ worsened: [], cleared: [] }` and performs
   no fetch (assert the mocked `fetchOpenMeteo` was not called).
2. **Happy path** → with a stored track and a mocked forecast that triggers one
   warning, `syncNow()` returns that warning in `worsened`, and
   `get('forecast')` afterwards holds `warnings` with it and a non-null
   `fetchedAt`.
3. **Unchanged weather** → running `syncNow()` twice with identical mocked data
   returns an empty delta the second time. This is the core anti-spam
   guarantee: unchanged weather must not notify.
4. **Track swapped mid-fetch** → make the mocked `fetchOpenMeteo` replace the
   stored track (`await set('track', {...other})`) before it resolves; assert
   `syncNow()` returns the empty delta and that `get('forecast')` was **not**
   overwritten with the new result. This pins `sync.ts:84-91`.
5. **`startAt` changed mid-fetch** → same as case 4 but changing only
   `startAt`; same expectation.
6. **Fetch failure** → make `fetchOpenMeteo` reject; assert `syncNow()`
   rejects, that a previously stored forecast is still present afterwards, and
   that `get('lastFetchError')` is non-null with a `message`. This pins
   `sync.ts:108-114`: a failed fetch must never blank the screen.

**Verify**: `npx vitest run app/lib/sync.test.ts` → all pass.

### Step 4: Pin `notifyDelta` behaviour

Extend `app/lib/notify.test.ts`. **Keep every existing test in that file
unchanged** — add a new `describe('notifyDelta')` block below them.

`notifyDelta` needs `Notification` and a service worker registration, neither
of which exists in Node. Install a minimal stand-in in `beforeEach` and restore
in `afterEach`: assign `globalThis.Notification` with a `permission` property,
and stub the registration lookup so `showNotification` records the calls it
receives. Read `app/lib/notify.ts` and stub exactly what it reaches for — do
not guess.

Cover exactly these cases:

1. **Nothing changed** → `notifyDelta({ worsened: [], cleared: [] })` shows no
   notification at all. This is the single most important assertion in the
   file: it is the whole reason the diff exists.
2. **Permission not granted** → nothing is shown, and it does not throw.
3. **Worsened warnings** → the notification body names the warnings; with more
   than three worsened, at most three are listed and the remainder is
   summarised rather than truncated silently.
4. **Cleared only** → the title differs from the worsened case (the app
   distinguishes "worsening" from "clearing").
5. **Distance rendering** → with a `kmBySeq` entry for the warning's `seq`, the
   body mentions that distance; with no entry, it still renders a location
   phrase rather than an empty string or `undefined`.

If any of these five fails against current code, that is a real finding: record
it in the "Notes" section you add at the bottom of `plans/README.md` and STOP.

**Verify**: `npx vitest run app/lib/notify.test.ts` → all pass, including the
pre-existing i18n tests.

### Step 5: Full suite and typecheck

**Verify**: `npx tsc --noEmit` → exit 0.

**Verify**: `npm test` → all pass; the total is now above 206.

## Test plan

This plan *is* the test plan. Summary of what must exist when it lands:

- `app/lib/store.test.ts` — 5 cases (defaults, round-trip, track back-fill,
  thresholds merge, `clearTrack` split).
- `app/lib/sync.test.ts` — 6 cases (no track, happy path, unchanged weather,
  track swapped, `startAt` changed, fetch failure).
- `app/lib/notify.test.ts` — existing i18n tests **plus** 5 `notifyDelta` cases.

Structural pattern to follow: `app/lib/warnings.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 and reports more than 206 tests
- [ ] `app/lib/store.test.ts` and `app/lib/sync.test.ts` exist
- [ ] `app/lib/notify.test.ts` still contains its original i18n tests **and** a
      `notifyDelta` describe block
- [ ] `git diff --name-only` lists only: `package.json`, `package-lock.json`,
      `app/lib/store.test.ts`, `app/lib/sync.test.ts`, `app/lib/notify.test.ts`
- [ ] No production file under `app/lib/` other than test files is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `syncNow` cannot be tested without editing `app/lib/sync.ts`. Report what
  blocks it; do not refactor production code to make it testable under this
  plan.
- A `notifyDelta` case in step 4 fails against current behaviour — that is a
  bug to report, not to fix here.
- You find yourself wanting to add a mocking library other than Vitest's own
  `vi`, or a second IndexedDB shim.
- The full suite drops below 206 passing tests at any point.

## Maintenance notes

- Plans 002 and 006 both edit this path. Their diffs should be read against
  these tests: if 002 is correct, the "unchanged weather" and "track swapped"
  cases keep passing while a **new** test for passed waypoints goes green.
- The `sync.test.ts` mocks pin the *shape* of `fetchOpenMeteo`,
  `fetchBulletin` and `fetchWildfires`. If any of those signatures changes,
  these mocks must change with them — that coupling is deliberate and cheap
  compared to a live-network test.
- Deferred: no test here covers `app/sw/index.ts`'s push handler. It duplicates
  the `kmBySeq` construction that plan 006 removes; revisit coverage after that
  lands.
