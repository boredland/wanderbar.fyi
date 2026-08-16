# Plan 004: Take the avalanche tests off the live network

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d5fa8a7..HEAD -- app/lib/avalanche.test.ts app/lib/avalanche.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

Three tests in `app/lib/avalanche.test.ts` call `fetchBulletin` without stubbing
`fetch`, so they issue **real HTTP requests to four public avalanche services**
every time `npm test` runs. That is three problems at once:

1. **The suite fails offline** — on a train, on a plane, in CI without egress.
   For a repo whose whole subject is working without a network, that is a poor
   joke.
2. **It hammers services this app depends on.** The repo is careful elsewhere
   about upstream rate limits (`/api/met` exists solely to send a compliant
   User-Agent; `/api/fwi` snaps coordinates to share cache entries). The test
   suite quietly undoes that care on every run.
3. **One assertion is conditional and can vacuously pass.**
   `if (b.status !== 'ok') expect(b.level).toBeNull()` — when a provider is up
   and returns `ok`, the test asserts *nothing*. The safety invariant it exists
   to protect is unverified exactly when the network works.

Plan 005 needs a stubbed `fetch` in this file to assert request counts. This
plan provides it, and makes the safety invariant actually hold.

## Current state

File: `app/lib/avalanche.test.ts` (157 lines). Its pure-function tests
(`parseLevel`, `problemLabel`, `inGeometry`, `withFreshness`) are good and stay
untouched. The network-touching block is `describe('never implies safety')`
(`avalanche.test.ts:93-117`):

```ts
/**
 * The one invariant that matters: this feature must never imply safety. Every
 * path that is not a live, in-date bulletin has to carry a null level and a
 * status the UI renders as "unknown".
 */
describe('never implies safety', () => {
  it('reports no coverage rather than silence where no service reaches', async () => {
    // Mid-Sahara: no avalanche service on earth covers this.
    const b = await fetchBulletin([wp(23.4, 12.0)])
    expect(b.status).toBe('no-coverage')
    expect(b.level).toBeNull()
  })

  it('returns an explicit non-answer for an empty track', async () => {
    const b = await fetchBulletin([])
    expect(b.status).toBe('no-coverage')
    expect(b.level).toBeNull()
  })

  it('never carries a danger level unless the bulletin is live and in date', async () => {
    for (const p of [[23.4, 12.0], [-44.0, 170.0], [61.6, 8.3], [46.8, 9.83]]) {
      const b = await fetchBulletin([wp(p[0], p[1])])
      if (b.status !== 'ok') expect(b.level, `${p} ${b.status}`).toBeNull()
    }
  }, 30000)
})
```

Which of these actually hit the network:

- Test 1 (Mid-Sahara `23.4, 12.0`) — **no request**. No provider bbox contains
  it, so `fetchBulletin` returns `no-coverage` before dispatching. Keep as is.
- Test 2 (empty track) — **no request**. Returns at `avalanche.ts:380`. Keep as
  is.
- Test 3 — **hits the network** for `61.6, 8.3` (NVE, Norway) and `46.8, 9.83`
  (SLF, Switzerland). This is the one to replace. Note the `30000` timeout on
  line 117, which exists only because real requests are slow.

The existing test helper (`avalanche.test.ts:13-21`):

```ts
const wp = (lat: number, lon: number): Waypoint => ({
  seq: 0,
  lat,
  lon,
  eleM: 2000,
  cumDistM: 0,
  cumAscentM: 0,
  etaOffsetS: 0
})
```

Provider bounding boxes you will need when choosing coordinates — read them from
the live source rather than trusting this list, but for orientation: `NVE`
(`avalanche.ts:163-193`), `SLF` (`:280-309`), `ALBINA` (`:320-355`), `AVCAN`
(`:195-234`, `bbox: [44, -141, 71, -52]`).

The upstream shapes each provider parses (all four differ) are visible in each
provider's `fetch`. Your fixtures must match the shape the code actually reads —
e.g. AVCAN reads `j?.report?.dangerRatings?.[0]?.ratings` with `alp`/`tln`/`btl`
keys, SLF and ALBINA go through `readCaaml` (`:250-278`).

### Conventions to match

No mocking library is used anywhere in this repo. Vitest's own `vi` is
available. For a global like `fetch`, the house-compatible approach is to assign
`globalThis.fetch` in `beforeEach` and restore the original in `afterEach`, so
no test leaks a stub into another file.

Test names are behaviour sentences; comments explain the safety reasoning. See
`app/lib/warnings.test.ts` for the fullest example of both.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                           | exit 0, no output   |
| Tests     | `npm test`                                   | all pass            |
| One file  | `npx vitest run app/lib/avalanche.test.ts`   | all pass, sub-second |

## Scope

**In scope**:

- `app/lib/avalanche.test.ts` — replace the network-touching test, add a stub

**Out of scope** (do NOT touch):

- `app/lib/avalanche.ts` — this plan changes **tests only**. If a fixture
  reveals a bug, report it; plans 003 and 005 own production changes to this
  file.
- The pure-function `describe` blocks (`parseLevel`, `problemLabel`,
  `inGeometry`, `withFreshness`) — they are correct and offline already.
- Tests 1 and 2 in `never implies safety` — they exercise the early-return
  paths and issue no requests. Keep them exactly as they are.
- Any other test file.

## Git workflow

- Branch: `advisor/004-avalanche-tests-offline`
- Commit message style, from `git log`: an imperative sentence describing the
  effect, e.g. `Stop the avalanche tests calling four public services`. Do
  **not** add `Co-Authored-By` or any attribution line.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the suite currently depends on the network

Confirm the problem before fixing it. Disable network access however your
environment allows and run the file; alternatively, add a temporary
`globalThis.fetch = () => { throw new Error('network') }` at the top of the file
and observe which tests fail.

Expected: the `'never carries a danger level unless the bulletin is live and in
date'` test fails or hangs; every other test in the file passes.

Remove any temporary code before continuing.

**Verify**: you can state which tests touched the network. If **none** do, the
file has already been fixed — STOP and report.

### Step 2: Add a `fetch` stub

At the top of `app/lib/avalanche.test.ts`, add a stub helper and lifecycle
hooks:

- Keep a reference to the original `globalThis.fetch`.
- In `afterEach`, restore it unconditionally.
- Provide a helper that installs a stub mapping a request URL to a canned
  response, and records every URL it was called with, so a test can assert both
  *what* was requested and *how many times*.

The stub must return something `Response`-shaped enough for the provider code:
the providers call `res.status`, `res.ok` and `await res.json()`. Use the real
`Response` constructor where practical rather than hand-rolling an object.

Only the pure-function tests and tests 1–2 exist so far, and none of them fetch,
so the suite must stay green after this step.

**Verify**: `npx vitest run app/lib/avalanche.test.ts` → all pass.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Replace the conditional network test with real assertions

Delete the `'never carries a danger level unless the bulletin is live and in
date'` test, including its `30000` timeout, and replace it with stubbed tests
that assert the safety invariant **unconditionally**. Cover:

1. **A live, in-date bulletin** returns `status: 'ok'` with a non-null level —
   the positive case the old conditional never checked.
2. **An expired bulletin** (`validUntilMs` in the past relative to the `now`
   argument `fetchBulletin` accepts) comes back `stale` with `level` null and
   `bands`/`problems` emptied. Pass an explicit `now` rather than relying on the
   clock.
3. **An upstream 404** yields `no-coverage` with a null level.
4. **An upstream 500** yields `error` with a null level — a failure must never
   read as safe.
5. **A network rejection** (stub throws) yields `error` with a null level, not
   an unhandled rejection.
6. **Out of season** (a provider returning no parseable rating) yields
   `out-of-season` with a null level.

Every one of these asserts `level === null` **unconditionally** except case 1.
That is the invariant the module header calls "the one invariant that matters".

Keep the existing `describe('never implies safety')` block and its doc comment;
add these inside it.

**Verify**: `npx vitest run app/lib/avalanche.test.ts` → all pass and the run
completes in well under a second.

### Step 4: Confirm no test in the repo touches the network

Search the whole test suite for other unstubbed `fetchBulletin`,
`fetchWildfires`, `fetchOpenMeteo` or `fetchMet` calls.

**Verify**: `npm test` → all pass with network access disabled. If another file
also needs the network, report it — do **not** fix it here; note it for a
follow-up.

**Verify**: `npx tsc --noEmit` → exit 0.

## Test plan

Rewritten in `app/lib/avalanche.test.ts`, inside `describe('never implies
safety')`:

- live in-date bulletin → `ok`, non-null level
- expired → `stale`, null level, empty bands and problems
- 404 → `no-coverage`, null level
- 500 → `error`, null level
- network rejection → `error`, null level
- no parseable rating → `out-of-season`, null level

Unchanged and still passing: the two early-return tests, and every
`parseLevel` / `problemLabel` / `inGeometry` / `withFreshness` test.

Structural pattern: `describe('withFreshness')` in the same file — literal
fixtures, explicit `now`, no clock dependence.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 **with network access disabled**
- [ ] `grep -n "30000" app/lib/avalanche.test.ts` returns nothing
- [ ] `app/lib/avalanche.test.ts` contains no conditional assertion of the form
      `if (...) expect(...)`
- [ ] `npx vitest run app/lib/avalanche.test.ts` completes in under a second
- [ ] `app/lib/avalanche.ts` is unmodified
- [ ] `git diff --name-only` lists only `app/lib/avalanche.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- No test in the file touches the network — it has already been fixed.
- A fixture you write reveals a production bug in `app/lib/avalanche.ts`.
  Report it; do not fix it here (plans 003 and 005 own that file).
- You find yourself wanting to add a mocking library, an HTTP recorder, or a
  fixture-loading framework. A stub function and literal objects are enough.
- Restoring `globalThis.fetch` in `afterEach` proves insufficient and stubs leak
  between test files.

## Maintenance notes

- The rule worth keeping: **no test in this repo performs a real network
  request.** A test that needs upstream data needs a fixture.
- Fixtures pin the four upstream response shapes. When a provider changes its
  API, the fixture and the provider must change together — that coupling is the
  point, and is far better than discovering the change through a silent
  `no-coverage` in the field.
- Plan 005 builds directly on the stub added here to assert request counts. Keep
  the recorded-URL list in the helper; it is not dead weight.
- Deferred: `app/lib/wildfire.ts` and `app/lib/weather.ts` have their own
  network calls. Their tests do not appear to hit the network, but a follow-up
  should confirm and apply the same rule.
