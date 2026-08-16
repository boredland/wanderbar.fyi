# Plan 007: Require a same-origin request to change or delete the wake schedule

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d5fa8a7..HEAD -- app/routes/api/wake.ts app/waker.ts app/islands/schedule-settings.tsx app/islands/manage.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d5fa8a7`, 2026-08-16

## Why this matters

`PUT /api/wake` and `DELETE /api/wake` are public, unauthenticated, and perform
no origin check. The Durable Object is addressed by a fixed name — `idFromName('solo')`
— so there is exactly **one** row shared by everyone using the deployment.

Any page on the internet can therefore issue a cross-site `DELETE` to
`/api/wake` and silently clear the stored subscription and its alarm. The DO
holds at most one pending alarm; clearing it ends **every future wake**. The
hiker gets no error and no notification — the failure is invisible until the
weather they were relying on being told about arrives unannounced.

A `PUT` is likewise unguarded and overwrites the single row outright
(`ON CONFLICT(id) DO UPDATE SET`).

The app has no accounts and deliberately stores no user identity, so the
proportionate fix is not authentication — it is refusing requests that did not
come from wanderbar's own page.

**Risk is MED, not LOW**: this rejects requests that currently succeed. If the
check is too strict, the app's own settings UI breaks and schedules can no
longer be set. Step 4's smoke test is what stops that shipping.

## Current state

Files:

- `app/routes/api/wake.ts` (25 lines) — the two public handlers.
- `app/waker.ts` — the DO; `clear()` and `save()` act on the single row.
- `app/islands/schedule-settings.tsx` — calls `PUT`.
- `app/islands/manage.tsx` — calls `DELETE`.

The complete route file (`app/routes/api/wake.ts:1-25`):

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

export const DELETE = createRoute(async (c) => {
  const res = await stub(c.env).fetch('https://waker/', { method: 'DELETE' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
```

The DO side, showing the single shared row (`app/waker.ts:61-64`, `:86-93`):

```ts
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'DELETE') {
      await this.clear()
      return Response.json({ ok: true })
```

```ts
    this.#ctx.storage.sql.exec(
      `INSERT INTO sub (id, endpoint, p256dh, auth, interval_h, start_h, end_h, tz, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
```

The known callers. `app/islands/manage.tsx:84`:

```ts
      fetch('/api/wake', { method: 'DELETE' })
```

Both callers use a **relative** URL from wanderbar's own page, so both are
same-origin requests and both will send `Sec-Fetch-Site: same-origin` in any
browser that implements Fetch Metadata. Verify this by reading the call sites
rather than trusting this note.

### The deployed origin

`wrangler.jsonc:22-27` binds one custom domain:

```jsonc
  "routes": [
    {
      "pattern": "wanderbar.fyi",
      "custom_domain": true
    }
  ],
```

The README notes the origin is load-bearing: the manifest's `share_target`, the
service worker scope and the push subscription are all origin-bound. Derive the
expected origin from the incoming request URL rather than hardcoding the
hostname, so `wrangler dev` on `localhost:8787` keeps working.

### Design constraints you must honour

From `README.md`:

- No accounts, no sessions, no extra server state. Do not add a token store, a
  cookie, or a second DO row.
- The only server state stays one subscription and one schedule.
- The service worker deliberately never intercepts `/api/*` or non-GET requests,
  so it cannot be relied on to add a header.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`     | exit 0, no output   |
| Tests     | `npm test`             | all pass            |
| Worker    | `npx wrangler dev`     | serves on :8787     |

## Scope

**In scope**:

- `app/routes/api/wake.ts` — the origin guard on both handlers
- `app/lib/same-origin.ts` (create, optional) — the predicate, if extracting it
  makes it testable
- `app/lib/same-origin.test.ts` (create, if the above is created)

**Out of scope** (do NOT touch):

- `app/waker.ts` — the DO's own `fetch` is reachable only through the binding,
  not from the internet. Guarding the public route is the right layer.
- `app/routes/api/met.ts` and `app/routes/api/fwi.ts` — read-only GETs that
  change no state. Adding an origin check there is a separate decision about
  upstream quota, deliberately not bundled here.
- `app/routes/_middleware.ts` — it owns locale negotiation; do not turn it into
  a security layer in this plan.
- `app/islands/schedule-settings.tsx` and `app/islands/manage.tsx` — they
  already issue same-origin relative requests. Only touch them if step 4 proves
  they break, and report if so.

## Git workflow

- Branch: `advisor/007-same-origin-wake-route`
- Commit message style, from `git log`: an imperative sentence describing the
  effect, e.g. `Refuse a wake change that did not come from our own page`. Do
  **not** add `Co-Authored-By` or any attribution line.
- Do NOT push or open a PR.

## Steps

### Step 1: Confirm both callers are same-origin

Read `app/islands/schedule-settings.tsx` and `app/islands/manage.tsx` and
confirm every call to `/api/wake` uses a relative URL from the app's own page.

If any caller uses an absolute URL, a different origin, or runs from the service
worker, STOP and report — the guard would break it.

**Verify**: state the exact fetch call sites and that all are relative.

### Step 2: Write the guard

Add a check to **both** `PUT` and `DELETE` in `app/routes/api/wake.ts` that a
request came from wanderbar's own page. Accept when either holds:

- `Sec-Fetch-Site` is `same-origin`. This header is browser-set and cannot be
  forged by page JavaScript, which makes it the primary signal.
- `Sec-Fetch-Site` is absent **and** the `Origin` header matches the request
  URL's own origin. This is the fallback for clients that do not send Fetch
  Metadata.

Reject with `403` and an error code in the existing style (the file already uses
`{ error: 'bad_json' }`), e.g. `{ error: 'cross_origin' }`.

Derive the expected origin from `new URL(c.req.url).origin` — do **not**
hardcode `wanderbar.fyi`, or local development and any preview deployment
break.

Add a comment in the house style explaining *why*: the DO holds one shared row
and one pending alarm, so a cross-site `DELETE` silently ends every future wake.

If extracting the predicate into `app/lib/same-origin.ts` makes it unit-testable
without a Worker runtime, do that and test it — same shape as `isValidSchedule`
in `app/lib/schedule.ts`.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all pass.

### Step 3: Unit-test the predicate

If step 2 extracted a predicate, create `app/lib/same-origin.test.ts` covering:
`Sec-Fetch-Site: same-origin` accepted; `cross-site` rejected; `same-site`
rejected (a sibling subdomain is not this origin); absent header with matching
`Origin` accepted; absent header with a different `Origin` rejected; absent
header and absent `Origin` rejected.

If the guard was written inline instead, say so and rely on step 4 for proof.

**Verify**: `npx vitest run app/lib/same-origin.test.ts` → all pass.

### Step 4: Smoke-test the real Worker — this is the proof

Start the Worker: `npx wrangler dev`.

Exercise both handlers against the running server and record the actual status
codes:

1. `DELETE /api/wake` with `Sec-Fetch-Site: cross-site` → `403`.
2. `DELETE /api/wake` with `Sec-Fetch-Site: same-origin` → the pre-existing
   success status, not `403`.
3. `PUT /api/wake` with a valid body and `Sec-Fetch-Site: cross-site` → `403`.
4. `PUT /api/wake` with the same valid body and `Sec-Fetch-Site: same-origin` →
   the pre-existing success status.
5. `PUT /api/wake` with a non-JSON body and `Sec-Fetch-Site: same-origin` →
   still `400` `bad_json` (unchanged).

**Verify**: cases 1 and 3 return `403`; cases 2 and 4 succeed; case 5 is
unchanged.

### Step 5: Verify the actual UI still works

With `npx wrangler dev` running, open the app in a real browser and:

- Enable a wake schedule through the settings UI. It must save without an error.
- Disable it again through the manage UI. It must clear without an error.

This is the regression this plan most plausibly causes; a passing curl in step 4
does not substitute for it. If notification permission cannot be granted in your
environment, drive the two `fetch` calls from the page's own devtools console
instead — still same-origin, still a real browser — and say that is what you
did.

**Verify**: both UI actions complete without a `403`, and describe what you
observed.

## Test plan

New (if the predicate is extracted): `app/lib/same-origin.test.ts` — six cases
as listed in step 3.

Behavioural proof: steps 4 and 5, recorded. The route handlers are not unit-
testable without a Worker runtime, which is why the smoke test is mandatory
rather than optional here.

Existing tests that must keep passing: the entire suite; none currently covers
these routes.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] Both `PUT` and `DELETE` in `app/routes/api/wake.ts` reject a cross-site
      request with `403`
- [ ] No hostname is hardcoded; the expected origin comes from the request URL
- [ ] Step 4's recorded output shows `403` for cases 1 and 3 and success for
      cases 2 and 4, with case 5 unchanged
- [ ] Step 5 confirms enabling and disabling a schedule in a real browser still
      works
- [ ] `app/waker.ts` is unmodified
- [ ] `git diff --name-only` lists only files from the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A caller in step 1 is not same-origin.
- Step 5 shows the settings or manage UI breaking — revert and report rather
  than loosening the guard until the UI passes.
- `npx wrangler dev` cannot start. Steps 4 and 5 are this plan's only proof and
  must not be skipped silently.
- The change appears to require touching `app/waker.ts`, adding a token, a
  cookie, or any new server state.
- You are tempted to accept `Sec-Fetch-Site: same-site`. A sibling subdomain is
  not this origin, and the push subscription is origin-bound.

## Maintenance notes

- The invariant: **state-changing routes must verify the request came from this
  origin.** If a third route ever mutates the DO, it needs the same guard; the
  extracted predicate is there to make that a one-line addition.
- `Sec-Fetch-Site` is browser-set and unforgeable from page script, which is why
  it is preferred over `Origin` alone. The `Origin` fallback exists for
  non-browser clients and is the weaker of the two.
- A reviewer should confirm no hostname is hardcoded — that is what would break
  preview deployments and local development.
- Deferred: `/api/met` and `/api/fwi` remain open GETs. They change no state,
  but they do consume upstream quota granted to this app's User-Agent. Whether
  to restrict them is a separate decision about rate limiting, not CSRF, and
  should be planned on its own evidence.
- Also deferred: `app/islands/manage.tsx:84` calls `fetch('/api/wake', ...)`
  without awaiting or checking the response, so a `403` there would be silent.
  Worth fixing, but it is an error-handling change in an island and out of
  scope here.
