import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFireRanking,
  parseFeatureInfo,
  rankingPercentile,
  RANKING_FORECAST_DAYS,
  readRanking,
  requestUrl
} from './fire-ranking'

/** The table EFFIS actually answers a GetFeatureInfo with. */
const table = (rows: Record<string, string>) =>
  `<H2>Fire Danger</H2>\n<table id="main">\n` +
  Object.entries(rows)
    .map(([k, v]) => `    <tr><td>${k}</td><td>${v}</td></tr>`)
    .join('\n') +
  `\n</table>`

const LIVE = table({
  'Fire Weather Index (FWI)': '60.324478',
  'Initial Spread Index (ISI)': '19.381023',
  'Build Up Index (BUI)': '283.83401',
  'Anomaly Index': '2.8126149',
  'Ranking Index': '98.918594'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseFeatureInfo', () => {
  it('reads the labelled values out of the table', () => {
    const got = parseFeatureInfo(LIVE)
    expect(got['Ranking Index']).toBeCloseTo(98.9186, 3)
    expect(got['Anomaly Index']).toBeCloseTo(2.8126, 3)
  })

  /**
   * The Meteo-France layer answers with its template unfilled, so the rows are
   * present and the values are literally `[FWI]`. Number('[FWI]') is NaN, and
   * a NaN percentile must not become a reading.
   */
  it('ignores an unfilled template rather than reading NaN as a value', () => {
    const got = parseFeatureInfo(table({ 'Ranking Index': '[RANKING]', 'Anomaly Index': '' }))
    expect(got['Ranking Index']).toBeUndefined()
    expect(got['Anomaly Index']).toBeUndefined()
  })
})

describe('readRanking', () => {
  it('reads a day from the live table shape', () => {
    const got = readRanking(LIVE, '2026-08-17')
    expect(got?.date).toBe('2026-08-17')
    expect(got?.percentile).toBeCloseTo(98.9186, 3)
  })

  /**
   * Past the horizon the table comes back with no rows at all. That is an
   * absent answer, not a fire season of zero, so it must not read as a
   * percentile.
   */
  it('has no reading when the service answers with an empty table', () => {
    expect(readRanking(table({}), '2026-08-30')).toBeNull()
    expect(readRanking('<html>gateway</html>', '2026-08-30')).toBeNull()
  })

  it('refuses a percentile outside the scale', () => {
    expect(readRanking(table({ 'Ranking Index': '-3' }), '2026-08-17')).toBeNull()
    expect(readRanking(table({ 'Ranking Index': '140' }), '2026-08-17')).toBeNull()
  })

  it('reads the percentile without needing the rest of the table', () => {
    const got = readRanking(table({ 'Ranking Index': '92.5' }), '2026-08-17')
    expect(got?.percentile).toBe(92.5)
  })

  /**
   * NaN fails every comparison, so a range check alone lets it through and the
   * reader is told the day was "worse than NaN% of days".
   */
  it('refuses a value that is not a number at all', () => {
    expect(readRanking(table({ 'Ranking Index': 'n/a' }), '2026-08-17')).toBeNull()
    expect(rankingPercentile(Number.NaN)).toBeNull()
    expect(rankingPercentile(Number.POSITIVE_INFINITY)).toBeNull()
  })

  /**
   * The table is a rendered template, not a data format. An upstream edit that
   * adds a class or a newline must not silently drop every reading.
   */
  it('reads the table through attributes, whitespace and case', () => {
    const messy =
      '<TR class="row">\n  <TD align="left">Ranking Index</TD>\n  <TD class="v">97.5</TD>\n</TR>'
    expect(readRanking(messy, '2026-08-17')?.percentile).toBe(97.5)
  })
})

describe('rankingPercentile', () => {
  /**
   * Rounded down, never to nearest: a day beaten by more than 1% of the record
   * must not be printed as "worse than 99%". The claim has to be one the
   * record supports.
   */
  it('reports the measured figure, rounded down', () => {
    expect(rankingPercentile(98.918594)).toBe(98)
    expect(rankingPercentile(99.9)).toBe(99)
    expect(rankingPercentile(90.6)).toBe(90)
  })

  /**
   * "Worse than 60% of days" describes an ordinary day in a way that teaches a
   * reader to skip the line, so nothing is said at all below the top decile.
   */
  it('says nothing about an ordinary day', () => {
    expect(rankingPercentile(89.9)).toBeNull()
    expect(rankingPercentile(50)).toBeNull()
    expect(rankingPercentile(0)).toBeNull()
  })

  it('starts speaking exactly at the top decile', () => {
    expect(rankingPercentile(90)).toBe(90)
  })
})

describe('requestUrl', () => {
  it('asks the queryable layer for the table that carries the values', () => {
    const url = new URL(requestUrl(43.5, 6.0, '2026-08-17'))
    expect(url.searchParams.get('request')).toBe('GetFeatureInfo')
    expect(url.searchParams.get('query_layers')).toBe('ecmwf.query')
    // Only the HTML representation has the numbers in it; GML carries a bbox
    // and plain text an empty feature.
    expect(url.searchParams.get('info_format')).toBe('text/html')
    expect(url.searchParams.get('time')).toBe('2026-08-17')
    // MapServer 8 rejects a request that omits STYLES entirely.
    expect(url.searchParams.get('styles')).toBe('')
  })
})

describe('fetchFireRanking', () => {
  it('reports a day per forecast date, dated in UTC', async () => {
    vi.stubGlobal('fetch', async () => new Response(LIVE))
    const days = await fetchFireRanking(43.5, 6.0, 3, Date.UTC(2026, 7, 17, 12))
    expect(days.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
    expect(days[0].percentile).toBeCloseTo(98.9186, 3)
  })

  it('never asks beyond the horizon the service answers for', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return new Response(LIVE)
    })
    await fetchFireRanking(43.5, 6.0, 16)
    expect(asked).toHaveLength(RANKING_FORECAST_DAYS)
  })

  it('resolves empty on failure rather than throwing into the sync', async () => {
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 502 }))
    expect(await fetchFireRanking(43.5, 6.0, 3)).toEqual([])

    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    expect(await fetchFireRanking(43.5, 6.0, 3)).toEqual([])
  })

  it('keeps the days it could read when only some fail', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      new URL(url).searchParams.get('time') === '2026-08-18'
        ? new Response('boom', { status: 502 })
        : new Response(LIVE)
    )
    const days = await fetchFireRanking(43.5, 6.0, 3, Date.UTC(2026, 7, 17, 12))
    expect(days.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-19'])
  })

  it('does not call the service for a coordinate it cannot use', async () => {
    const called = vi.fn()
    vi.stubGlobal('fetch', called)
    expect(await fetchFireRanking(NaN, 6.0, 3)).toEqual([])
    expect(called).not.toHaveBeenCalled()
  })
})
