# Plan 006: Validate the push endpoint before storing and calling it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d5fa8a7..HEAD -- app/waker.ts app/routes/api/wake.ts app/lib/schedule.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

`PUT /api/wake` is public and unauthenticated. It forwards its JSON body to the
Durable Object, which stores the `endpoint` string after checking only that it
is non-empty. Later, on its alarm, the Durable Object builds a **signed VAPID
`Authorization` header** and issues `fetch(row.endpoint)` — sending that signed
credential to whatever URL was stored.

Two consequences, both defensive-maintenance concerns rather than theoretical:

- **Outbound request to an arbitrary destination.** The Worker will make a POST
  to any URL that was stored, on a schedule, carrying a header signed with this
  origin's VAPID key. A stored URL is never re-validated.
- **Scheme confusion.** Nothing requires `https:`. A non-HTTPS or non-HTTP
  scheme reaches `fetch` as-is.

The fix is input validation at the boundary: a push endpoint is always an
`https:` URL belonging to a browser push service. Anything else is not a
subscription and should be rejected before it is persisted.

This plan does **not** add authentication — the app deliberately stores one
subscription with no accounts. Plan 007 adds the origin check that stops
cross-site callers reaching this route at all; the two are complementary and
independent.

## Current state

Files:

- `app/routes/api/wake.ts` (25 lines) — thin public route, forwards to the DO.
- `app/waker.ts` (152 lines) — the Durable Object: one subscription, one
  schedule, alarm-driven push.
- `app/lib/schedule.ts` — `isValidSchedule`, the existing validation exemplar.

The whole public route (`app/routes/api/wake.ts:1-25`):

```ts
import { createRoute } from 'honox/factory'
import type { WakerSave } from '../../waker'

// One named instance: DO instances cannot be enumerated, and there is one track.
const stub = (env: Bindings) => env.WAKER.get(env.WAKER.idFromName('solo'))

export const PUT = createRoute(async (c) => {
  let body: WakerSave
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }
  const res = await stub(c.env).fetch('https://waker/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
```

The stored shape (`app/waker.ts:4-12`):

```ts
export type WakerSave = {
  endpoint: string
  p256dh: string
  auth: string
  intervalH: number
  ...
```

The only validation before persisting (`app/waker.ts:83-93`):

```ts
    if (!isValidSchedule(schedule)) return null
    if (!s.endpoint || !s.p256dh || !s.auth) return null

    this.#ctx.storage.sql.exec(
      `INSERT INTO sub (id, endpoint, p256dh, auth, interval_h, start_h, end_h, tz, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
```

Where the stored endpoint is used (`app/waker.ts:113-136`):

```ts
  async alarm(): Promise<void> {
    const row = this.#row()
    if (!row) return

    ...
      const { headers, body, method } = await buildPushPayload(
        { data: { kind: 'wake', at: Date.now() }, options: { ttl: 900, urgency: 'high' } },
        {
          endpoint: row.endpoint,
          expirationTime: null,
          keys: { p256dh: row.p256dh, auth: row.auth }
        },
        ...
      )
      const res = await fetch(row.endpoint, {
        method,
        headers,
        body: body.slice().buffer
      })
```

The re-arm contract, which your change must not break (`app/waker.ts:147-150`):

```ts
    // A DO holds at most one pending alarm, so a missed re-arm silently ends
    // every future wake. Re-arm on every path but a dead subscription.
    const next = nextWakeMs(scheduleOf(row), Date.now())
    if (next !== null) await this.#ctx.storage.setAlarm(next)
```

### The validation exemplar to follow

`app/lib/schedule.ts` exports `isValidSchedule`, used at `waker.ts:83`. Match
that shape: a small, pure, exported, unit-testable predicate in a lib module,
called from the boundary. Read it before writing yours.

### Design constraints you must honour

From `README.md`:

- Server state is deliberately **one** push subscription and **one** schedule in
  **one** Durable Object. Do not add storage, a second row, or a new binding.
- The push is a wake-up, not a warning. Do not change the payload or the
  notify-on-change behaviour.
- `Waker.alarm()` must re-arm on every path except a dead subscription
  (404/410). Validation must not introduce a path that silently stops re-arming
  an otherwise healthy subscription.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|-----------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                            | exit 0, no output   |
| Tests     | `npm test`                                    | all pass            |
| One file  | `npx vitest run app/lib/push-endpoint.test.ts`| all pass            |
| Worker    | `npx wrangler dev`                            | serves on :8787     |

## Scope

**In scope**:

- `app/lib/push-endpoint.ts` (create) — the validation predicate
- `app/lib/push-endpoint.test.ts` (create) — its tests
- `app/waker.ts` — call the predicate in `save()`
- `app/routes/api/wake.ts` — reject early with a clear status

**Out of scope** (do NOT touch):

- `app/lib/schedule.ts` — the schedule validation is already correct.
- The `alarm()` re-arm logic and the 404/410 dead-subscription handling.
- The SQL schema — no new column; validation happens before the write.
- `app/islands/schedule-settings.tsx` — the client subscribes through the real
  Push API, so its endpoints are legitimate and need no change. Confirm this
  rather than assume it.
- Adding authentication or a token. Out of scope by design.

## Git workflow

- Branch: `advisor/006-validate-push-endpoint`
- Commit message style, from `git log`: an imperative sentence describing the
  effect, e.g. `Refuse a push endpoint that is not a push service`. Do **not**
  add `Co-Authored-By` or any attribution line.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the predicate and its tests

Create `app/lib/push-endpoint.ts` exporting a single pure predicate, e.g.
`isPushEndpoint(value: unknown): boolean`. Rules:

- Must parse as a URL. A parse failure is a rejection, not a throw.
- Scheme must be exactly `https:`.
- Host must belong to a known browser push service. Cover at minimum the four
  in real use:
  - FCM / Chrome — `fcm.googleapis.com`, `*.googleapis.com`
  - Mozilla — `*.push.services.mozilla.com`
  - Apple — `*.push.apple.com`
  - Microsoft — `*.notify.windows.com`
- Suffix matching must be anchored on a dot boundary so a lookalike host cannot
  pass by ending with the same characters. Match `foo.push.apple.com`, reject a
  host that merely ends in `push.apple.com` as a substring of a different
  domain.
- No credentials in the URL (`username`/`password` empty).

Create `app/lib/push-endpoint.test.ts` covering: each accepted provider host;
a rejected non-HTTPS URL; a rejected unknown host; a rejected lookalike host
that ends with a provider's domain but is not a subdomain of it; a rejected
non-URL string; a rejected empty string; a rejected URL carrying credentials.

Follow `app/lib/warnings.test.ts` for style — behaviour-sentence names, no
mocks.

**Verify**: `npx vitest run app/lib/push-endpoint.test.ts` → all pass.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Enforce it in the Durable Object

In `app/waker.ts`, extend the existing guard at :84 so an endpoint failing
`isPushEndpoint` is rejected exactly as an invalid schedule already is —
`save()` returns `null` and nothing is written.

Add a one-line comment in the house style explaining *why*: the alarm sends a
signed VAPID header to this URL, so it must be a push service, not an arbitrary
destination.

The DO is the authority here: validating only in the route would leave the
storage path unguarded.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Reject early at the route

In `app/routes/api/wake.ts`, check the endpoint before calling the DO and return
`400` with an error code in the existing style (`{ error: 'bad_endpoint' }`),
matching the `bad_json` precedent.

Do not change the response shape for the success path or the `DELETE` handler.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all pass.

### Step 4: Smoke-test the real Worker

Start the Worker: `npx wrangler dev`.

Exercise `PUT /api/wake` against the running server:

- A body whose `endpoint` is a plausible FCM HTTPS URL, with a valid schedule →
  the response is the pre-existing success status, not `400`.
- A body whose `endpoint` is `http://` rather than `https://` → `400` with
  `bad_endpoint`.
- A body whose `endpoint` is an unrelated host → `400` with `bad_endpoint`.
- A body that is not JSON → still `400` with `bad_json` (unchanged).

Record the actual status codes and bodies you observed; that output is this
plan's proof.

**Verify**: the three rejection cases return `400` and the valid case does not.

### Step 5: Confirm a real subscription still works

Read `app/islands/schedule-settings.tsx` and confirm the endpoint it sends comes
from a genuine `PushSubscription`, so it satisfies the predicate. If the host it
produces in your environment is not in the allowlist, that is a finding — STOP
and report rather than widening the list to whatever appeared.

**Verify**: state which provider host the client would send and that
`isPushEndpoint` accepts it.

## Test plan

New: `app/lib/push-endpoint.test.ts` — accepted hosts per provider; rejected
non-HTTPS, unknown host, lookalike suffix, non-URL, empty string, URL with
credentials.

Existing tests that must keep passing: the whole suite, in particular
`app/lib/schedule.test.ts`, since `save()`'s guard is being extended.

Structural pattern: `app/lib/warnings.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with more tests than before
- [ ] `app/lib/push-endpoint.ts` exports a pure predicate with no I/O
- [ ] `app/waker.ts` rejects a non-push endpoint in `save()` before any SQL runs
- [ ] `app/routes/api/wake.ts` returns `400` `bad_endpoint` for a rejected URL
- [ ] Step 4's smoke test output is recorded, showing `400` for the three
      rejection cases and success for the valid one
- [ ] The `alarm()` re-arm logic is unchanged (`git diff app/waker.ts` shows no
      change below the `save()` method other than the new import)
- [ ] `git diff --name-only` lists only the four in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- A real `PushSubscription` in your environment produces a host the allowlist
  rejects. Report the host; do not widen the list to make a test pass.
- The change appears to require altering the SQL schema, the alarm re-arm path,
  or the 404/410 dead-subscription handling.
- `npx wrangler dev` cannot start in your environment — report it; the smoke
  test in step 4 is the proof this plan turns on and must not be skipped
  silently.
- You find yourself adding authentication, a token, or a second stored row.

## Maintenance notes

- The allowlist is the maintenance cost, and it is deliberate: a new browser
  push service means a new entry. That is a small, visible edit, and preferable
  to accepting any URL.
- A reviewer should check the host matching is anchored on a dot boundary —
  naive `endsWith` on a domain is the classic way this kind of check is
  bypassed.
- The endpoint is validated at write time only. A subscription stored before
  this change keeps working and is never re-checked; if that matters, a
  follow-up could validate on read in `alarm()` too — deliberately deferred here
  to keep the alarm path untouched.
- Plan 007 adds an origin check to the same routes. The two are independent:
  this one constrains *what* can be stored, that one constrains *who* can ask.
