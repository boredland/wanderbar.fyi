import { buildPushPayload } from '@block65/webcrypto-web-push'
import { isValidSchedule, nextWakeMs, type Schedule } from './lib/schedule'

export type WakerSave = {
  endpoint: string
  p256dh: string
  auth: string
  intervalH: number
  startH: number
  endH: number
  tz: string
}

type Row = {
  endpoint: string
  p256dh: string
  auth: string
  interval_h: number
  start_h: number
  end_h: number
  tz: string
}

const scheduleOf = (r: Row): Schedule => ({
  enabled: true,
  intervalH: r.interval_h,
  startH: r.start_h,
  endH: r.end_h,
  tz: r.tz
})

/**
 * The only server state: one push subscription plus one schedule. It holds no
 * waypoints, thresholds or forecasts and cannot compute a warning. The
 * service worker does that after being woken.
 */
export class Waker implements DurableObject {
  #ctx: DurableObjectState
  #env: Bindings

  constructor(ctx: DurableObjectState, env: Bindings) {
    this.#ctx = ctx
    this.#env = env
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sub (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
          interval_h INTEGER NOT NULL, start_h INTEGER NOT NULL, end_h INTEGER NOT NULL,
          tz TEXT NOT NULL, updated_at INTEGER NOT NULL
        )
      `)
    })
  }

  #row(): Row | null {
    const rows = this.#ctx.storage.sql.exec('SELECT * FROM sub WHERE id = 1').toArray()
    return (rows[0] as Row | undefined) ?? null
  }

  async fetch(req: Request): Promise<Response> {
    if (req.method === 'DELETE') {
      await this.clear()
      return Response.json({ ok: true })
    }
    if (req.method === 'PUT') {
      const body = (await req.json()) as WakerSave
      const result = await this.save(body)
      if (!result) return Response.json({ error: 'invalid_schedule' }, { status: 400 })
      return Response.json(result)
    }
    return new Response('method not allowed', { status: 405 })
  }

  async save(s: WakerSave): Promise<{ nextWakeMs: number | null } | null> {
    const schedule: Schedule = {
      enabled: true,
      intervalH: s.intervalH,
      startH: s.startH,
      endH: s.endH,
      tz: s.tz
    }
    if (!isValidSchedule(schedule)) return null
    if (!s.endpoint || !s.p256dh || !s.auth) return null

    this.#ctx.storage.sql.exec(
      `INSERT INTO sub (id, endpoint, p256dh, auth, interval_h, start_h, end_h, tz, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
         interval_h = excluded.interval_h, start_h = excluded.start_h,
         end_h = excluded.end_h, tz = excluded.tz, updated_at = excluded.updated_at`,
      s.endpoint,
      s.p256dh,
      s.auth,
      s.intervalH,
      s.startH,
      s.endH,
      s.tz,
      Date.now()
    )

    const next = nextWakeMs(schedule, Date.now())
    if (next !== null) await this.#ctx.storage.setAlarm(next)
    return { nextWakeMs: next }
  }

  async clear(): Promise<void> {
    this.#ctx.storage.sql.exec('DELETE FROM sub')
    await this.#ctx.storage.deleteAlarm()
  }

  async alarm(): Promise<void> {
    const row = this.#row()
    if (!row) return

    let subscriptionDead = false
    try {
      const { headers, body, method } = await buildPushPayload(
        { data: { kind: 'wake', at: Date.now() }, options: { ttl: 900, urgency: 'high' } },
        {
          endpoint: row.endpoint,
          expirationTime: null,
          keys: { p256dh: row.p256dh, auth: row.auth }
        },
        {
          subject: this.#env.VAPID_SUBJECT,
          publicKey: this.#env.VAPID_PUBLIC_KEY,
          privateKey: this.#env.VAPID_PRIVATE_KEY
        }
      )
      const res = await fetch(row.endpoint, {
        method,
        headers,
        body: body.slice().buffer
      })
      if (res.status === 404 || res.status === 410) subscriptionDead = true
      else if (!res.ok) console.error(`push failed ${res.status}`)
    } catch (e) {
      console.error('push threw', e)
    }

    if (subscriptionDead) {
      this.#ctx.storage.sql.exec('DELETE FROM sub')
      return
    }
    // A DO holds at most one pending alarm, so a missed re-arm silently ends
    // every future wake. Re-arm on every path but a dead subscription.
    const next = nextWakeMs(scheduleOf(row), Date.now())
    if (next !== null) await this.#ctx.storage.setAlarm(next)
  }
}
