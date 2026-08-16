# Plan 003: Return the elevation bands Avalanche Canada already parsed

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

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

The Avalanche Canada provider parses the bulletin's alpine and below-treeline
danger ratings into a `bands` array — and then returns `bands: []`, discarding
the work three lines later. The Swiss (SLF) and Euregio (ALBINA) providers both
return their bands correctly, so the app shows the elevation split in the Alps
and silently omits it in Canada.

This matters because the headline number is deliberately the **highest** of the
elevation bands. In Canada a hiker sees, say, `4` with no indication that the
`4` applies to the alpine and the valley they are actually walking is rated
lower — or, worse, the inverse framing where the split is the whole point. The
panel is built to show where the split falls rather than flattening it away
(`avalanche.ts:246-248`); on Canadian bulletins it currently has nothing to
show.

The fix is one expression. The value of this plan is the test that stops it
regressing and confirms the other providers are unaffected.

## Current state

File: `app/lib/avalanche.ts` — relays official bulletins from four providers
(NVE, SLF, ALBINA, AVCAN). Never computes a danger rating.

The `Bulletin` and `Band` types (`avalanche.ts:59-67`):

```ts
  /** Danger by elevation band, when the bulletin splits it. */
  bands: Band[]
  problems: string[]
  validUntilMs: number | null
  fetchedAtMs: number
}

/** A danger rating that applies only above or below some altitude. */
export type Band = { level: DangerLevel; aboveM: number | null; belowM: number | null }
```

The bug, in `AVCAN.fetch` (`avalanche.ts:207-231`). Note `bands` is built at
:214-218 and discarded at :226:

```ts
    const today = j?.report?.dangerRatings?.[0]?.ratings
    // Highest of the three elevation bands: the route may cross all of them and
    // this number is only ever a pointer to the real bulletin.
    const levels = [today?.alp?.rating, today?.tln?.rating, today?.btl?.rating]
      .map((r) => parseLevel(r?.value ?? r))
      .filter((l): l is DangerLevel => l !== null)
    if (levels.length === 0) return unavailable('out-of-season', AVCAN.name, AVCAN.url)
    const bands: Band[] = []
    const alp = parseLevel(today?.alp?.rating?.value ?? today?.alp?.rating)
    const btl = parseLevel(today?.btl?.rating?.value ?? today?.btl?.rating)
    if (alp !== null) bands.push({ level: alp, aboveM: null, belowM: null })
    if (btl !== null && btl !== alp) bands.push({ level: btl, aboveM: null, belowM: null })
    return {
      status: 'ok',
      level: Math.max(...levels) as DangerLevel,
      provider: AVCAN.name,
      providerUrl: typeof j?.url === 'string' ? j.url : AVCAN.url,
      region: typeof j?.area?.name === 'string' ? j.area.name : null,
      headline: typeof j?.report?.highlights === 'string' ? stripHtml(j.report.highlights) : null,
      bands: [],
```

Compare SLF, which returns its parsed bands (`avalanche.ts:294-303`):

```ts
    const { level, bands, problems } = readCaaml(p.dangerRatings, p.avalancheProblems)
    if (level === null) return unavailable('out-of-season', SLF.name, SLF.url)
    return {
      status: 'ok',
      ...
      bands,
```

And ALBINA likewise at `avalanche.ts:341,349`.

Note the Canadian bands carry `aboveM: null, belowM: null`: the API gives named
tiers (`alp`, `tln`, `btl`), not metre boundaries. That is correct and
deliberate — do not invent altitudes.

### Design constraints you must honour

Documented in `README.md` and in the module header at `avalanche.ts:3-28`:

- This module **only ever relays** an official bulletin and never derives one.
  Do not compute, interpolate or infer a band.
- An expired bulletin loses its number *and* its bands. `withFreshness`
  (`avalanche.ts:147-153`) nulls `level` and empties `bands` and `problems`.
  That behaviour must keep working after your change:
  ```ts
  return { ...b, status: 'stale', level: null, bands: [], problems: [] }
  ```
- The headline `level` stays the **highest** of the bands. Do not change how
  `level` is computed.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                           | exit 0, no output   |
| Tests     | `npm test`                                   | all pass            |
| One file  | `npx vitest run app/lib/avalanche.test.ts`   | all pass            |

## Scope

**In scope**:

- `app/lib/avalanche.ts` — the `AVCAN.fetch` return only
- `app/lib/avalanche.test.ts` — add tests

**Out of scope** (do NOT touch):

- `NVE`, `SLF`, `ALBINA` providers — SLF and ALBINA already return bands
  correctly; NVE returning `bands: []` at `avalanche.ts:187` is **correct**,
  because the NVE endpoint in use does not carry an elevation split. Do not
  "fix" NVE.
- `readCaaml` — the CAAML path is not involved; the Canadian API is not CAAML.
- `withFreshness` — already handles bands correctly.
- `app/islands/avalanche-panel.tsx` — the panel already renders `bands`; it
  needs no change to benefit from this fix.
- The `level` computation and `Bulletin`/`Band` types.

## Git workflow

- Branch: `advisor/003-avcan-elevation-bands`
- Commit message style, from `git log`: an imperative sentence describing the
  effect, e.g. `Return the bands Avalanche Canada already read`. Do **not** add
  `Co-Authored-By` or any attribution line.
- Do NOT push or open a PR.

## Steps

### Step 1: Extract the AVCAN band mapping into a testable function

`AVCAN.fetch` performs a live network call, so its return cannot be asserted
directly without hitting the network — which this repo should not do (see plan
005).

Extract the pure part: a module-level function taking the parsed
`today` ratings object and returning `{ levels, bands }`, or taking the ratings
and returning `Band[]`. Export it so the test can reach it. Keep it directly
above `AVCAN` and name it in the module's style (the neighbouring pure helper
is `readCaaml`, so something like `readAvcanBands` fits).

Move the existing lines :214-218 into it verbatim — same parsing, same
`aboveM: null, belowM: null`, same "skip below-treeline when it equals alpine"
rule. Do not change behaviour in this step.

**Verify**: `npx tsc --noEmit` → exit 0.

**Verify**: `npm test` → all pass (behaviour is unchanged so far).

### Step 2: Return the bands

In `AVCAN.fetch`, replace the hardcoded `bands: []` with the bands from the
function extracted in step 1.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Test the mapping

In `app/lib/avalanche.test.ts`, add a `describe` block for the new function.
Follow the file's existing style — it already has focused `describe` blocks for
`parseLevel`, `problemLabel`, `inGeometry` and `withFreshness`.

Cover exactly these cases:

1. Alpine and below-treeline **differing** → two bands, in that order, each
   with `aboveM: null` and `belowM: null`.
2. Alpine and below-treeline **equal** → one band only. (The existing
   `btl !== alp` guard exists so an undivided bulletin does not render the same
   number twice.)
3. Ratings given as `{ value: ... }` objects **and** as bare values both parse —
   the code handles both via `r?.value ?? r`, and the real API has used both
   shapes.
4. No parseable rating → an empty array, not a band with a null level.
5. A rating outside 1–5 (`'0'`, which Avalanche Canada publishes out of season)
   contributes no band. `parseLevel` already rejects it; this pins that it is
   not smuggled in through the band path.

**Verify**: `npx vitest run app/lib/avalanche.test.ts` → all pass.

### Step 4: Confirm the expiry contract still holds

`withFreshness` must still strip bands from an expired bulletin. The existing
test `'drops the level entirely once expired, not just the label'`
(`avalanche.test.ts:143-152`) asserts `old.bands` is `[]`.

**Verify**: `npx vitest run app/lib/avalanche.test.ts -t 'drops the level entirely'`
→ passes.

**Verify**: `npm test` → all pass; `npx tsc --noEmit` → exit 0.

## Test plan

New tests in `app/lib/avalanche.test.ts`, in a `describe` for the extracted
band-reading function: five cases as listed in step 3.

Structural pattern: the `describe('withFreshness')` block in the same file —
literal fixtures, no network, behaviour-sentence names.

Existing test that must keep passing unchanged: `'drops the level entirely once
expired, not just the label'`.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with more tests than before
- [ ] `grep -n "bands: \[\]" app/lib/avalanche.ts` returns only the lines in
      `unavailable` (:99), `withFreshness` (:152) and the NVE provider (:187) —
      **not** a line inside `AVCAN.fetch`
- [ ] The new band-reading function is exported and has its own `describe` block
- [ ] `git diff --name-only` lists only `app/lib/avalanche.ts` and
      `app/lib/avalanche.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code — in particular if
  `bands: []` at `avalanche.ts:226` has already been fixed.
- Extracting the function in step 1 changes any existing test result. It must
  be a pure move.
- You find yourself needing to change `parseLevel`, `readCaaml`, or any provider
  other than AVCAN.
- The Avalanche Canada response shape appears to differ from what the code
  parses (`j?.report?.dangerRatings?.[0]?.ratings` with `alp`/`tln`/`btl`) — do
  not guess at a new shape from live API output; report it.

## Maintenance notes

- `tln` (treeline) is deliberately read into `levels` for the headline number
  but is **not** emitted as a band: only alpine and below-treeline are, so the
  panel shows the extremes of the split. If a future change adds `tln` as a
  third band, the panel's rendering of three bands should be checked.
- Canadian bands intentionally carry `aboveM: null, belowM: null` because the
  API names tiers rather than altitudes. A reviewer should confirm no metre
  values were invented.
- The four providers each map a different upstream schema onto one `Bulletin`.
  The discarded-variable class of bug is easy to repeat there; the extracted
  pure function makes AVCAN's mapping testable, and the same treatment would
  suit NVE if its endpoint ever gains an elevation split.
