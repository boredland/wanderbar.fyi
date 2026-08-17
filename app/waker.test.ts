import { afterEach, describe, expect, it, vi } from 'vitest'
import { Waker } from './waker'

/**
 * The alarm is the only part of this app that runs with nobody watching, and a
 * Durable Object holds at most one pending alarm: a missed re-arm silently ends
 * every future wake, and an alarm that never stops keeps pushing at an address
 * nobody reads. Both directions matter, so both are pinned here.
 *
 * The storage and alarm surfaces are stood up in memory. That is enough for the
 * decisions this covers, which are about *when* the alarm re-arms and when the
 * row is dropped, not about SQLite itself.
 */

type Row = Record<string, unknown>

function fakeCtx() {
  let rows: Row[] = []
  let alarm: number | null = null
  return {
    alarmAt: () => alarm,
    clearAlarm: () => {
      alarm = null
    },
    rowCount: () => rows.length,
    storage: {
      sql: {
        exec(query: string, ...args: unknown[]) {
          const q = query.trim().toUpperCase()
          if (q.startsWith('CREATE TABLE')) return { toArray: () => [] }
          if (q.startsWith('SELECT')) return { toArray: () => rows }
          if (q.startsWith('DELETE')) {
            rows = []
            return { toArray: () => [] }
          }
          if (q.startsWith('INSERT')) {
            rows = [
              {
                endpoint: args[0],
                p256dh: args[1],
                auth: args[2],
                interval_h: args[3],
                start_h: args[4],
                end_h: args[5],
                tz: args[6]
              }
            ]
            return { toArray: () => [] }
          }
          return { toArray: () => [] }
        }
      },
      setAlarm(at: number) {
        alarm = at
        return Promise.resolve()
      },
      deleteAlarm() {
        alarm = null
        return Promise.resolve()
      }
    },
    blockConcurrencyWhile: (fn: () => Promise<void>) => fn()
  }
}

/** Throwaway P-256 material, generated for this file: real crypto, no secret. */
const env = {
  VAPID_SUBJECT: 'mailto:test@example.invalid',
  VAPID_PUBLIC_KEY:
    'BMYfccwNOFgJQRlWGpglS2i1dfGMywrklGQxFTSttgVgVPfT_IgSt2tjxpdAGI2dTxrxIb6O_7SLQmaTF9LVQ8A',
  VAPID_PRIVATE_KEY: 'irWhduTbgns-NQrlNhj3cJ3bv_phQeeG3kknVE1AfrY'
}

const SAVE = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'BJMTDhhW7ndx8V-_74xCYCtJvXeYhsD5vFOTO6FABzRLcF0oM2rUn-1OkF2YxITzUeq34E7gFQOVQKO6CwjvzV0',
  auth: 'EkzcXHzmjqr3cGK0vHMpEw',
  intervalH: 3,
  startH: 7,
  endH: 19,
  tz: 'UTC'
}

const make = (ctx: ReturnType<typeof fakeCtx>) =>
  new Waker(ctx as never, env as never)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a subscription the push service has forgotten', () => {
  it('is dropped and left un-armed, rather than pushed at forever', async () => {
    // 410 Gone is how a push service reports a subscription that no longer
    // exists — including one fabricated by a caller that never had one.
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 410 })))
    const ctx = fakeCtx()
    const waker = make(ctx)
    await waker.save(SAVE)
    expect(ctx.rowCount()).toBe(1)

    await waker.alarm()

    expect(ctx.rowCount()).toBe(0)
    // The pending alarm from save() is left to fire once more: it finds no row,
    // returns before re-arming, and the instance goes quiet. That is what
    // bounds a subscription nobody can receive — it costs one more wake, not a
    // schedule that runs forever.
    await waker.alarm()
    expect(ctx.rowCount()).toBe(0)
  })

  it('is dropped on 404 as well', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })))
    const ctx = fakeCtx()
    const waker = make(ctx)
    await waker.save(SAVE)

    await waker.alarm()

    expect(ctx.rowCount()).toBe(0)
  })
})

describe('a subscription that is merely unreachable', () => {
  it('keeps its row and re-arms, because one missed re-arm ends every wake', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')))
    const ctx = fakeCtx()
    const waker = make(ctx)
    await waker.save(SAVE)
    // Clear the alarm save() set, so what is asserted below is the re-arm the
    // alarm itself performs and not the one that was already pending.
    ctx.clearAlarm()

    await waker.alarm()

    expect(ctx.rowCount()).toBe(1)
    expect(ctx.alarmAt()).toBeGreaterThan(Date.now())
  })

  it('re-arms after a server error too', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 500 })))
    const ctx = fakeCtx()
    const waker = make(ctx)
    await waker.save(SAVE)
    ctx.clearAlarm()

    await waker.alarm()

    expect(ctx.rowCount()).toBe(1)
    expect(ctx.alarmAt()).toBeGreaterThan(Date.now())
  })
})

describe('what save refuses', () => {
  it('refuses an endpoint that is not a push service', async () => {
    const ctx = fakeCtx()
    const waker = make(ctx)

    expect(await waker.save({ ...SAVE, endpoint: 'https://attacker.test/collect' })).toBeNull()
    expect(ctx.rowCount()).toBe(0)
    expect(ctx.alarmAt()).toBeNull()
  })

  it('refuses a schedule that would end every future wake', async () => {
    const ctx = fakeCtx()
    const waker = make(ctx)

    expect(await waker.save({ ...SAVE, tz: 'Not/AZone' })).toBeNull()
    expect(ctx.rowCount()).toBe(0)
  })
})
