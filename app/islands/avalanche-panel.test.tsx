import { describe, expect, it } from 'vitest'
import AvalanchePanel from './avalanche-panel'
import type { Bulletin, BulletinStatus } from '../lib/avalanche'

const base: Bulletin = {
  status: 'ok',
  level: 3,
  provider: 'SLF',
  providerUrl: 'https://slf.ch/',
  region: 'Davos',
  headline: 'Weak layers in the old snowpack.',
  bands: [
    { level: 2, aboveM: null, belowM: 2200 },
    { level: 3, aboveM: 2200, belowM: null }
  ],
  problems: ['Persistent weak layers'],
  validUntilMs: 9e15,
  fetchedAtMs: 0
}

/**
 * Honox serialises the island's props into a data- attribute, so assertions
 * must read the rendered body only; otherwise a suppressed danger level still
 * "appears" in the markup as JSON and the safety assertions pass vacuously.
 */
const body = (b: Bulletin | null): string => {
  const html = String((AvalanchePanel as any)({ bulletin: b }))
  return html.replace(/ data-serialized-props="[^"]*"/g, '')
}

const UNKNOWNS: BulletinStatus[] = ['no-coverage', 'out-of-season', 'stale', 'error']
const unknown = (status: BulletinStatus) =>
  body({ ...base, status, level: null, bands: [], problems: [], headline: null })

describe('AvalanchePanel', () => {
  it('shows level, region, elevation bands and the bulletin’s own words', () => {
    const h = body(base)
    expect(h).toContain('Considerable')
    expect(h).toContain('Davos')
    expect(h).toContain('above 2200 m')
    expect(h).toContain('Persistent weak layers')
    expect(h).toContain('Weak layers in the old snowpack.')
  })

  it('always admits it knows neither slope angle nor aspect', () => {
    expect(body(base)).toContain('slope angle and aspect')
  })

  it('always links out to the issuing service', () => {
    expect(body(base)).toContain('https://slf.ch/')
    for (const s of UNKNOWNS) expect(unknown(s), s).toContain('https://slf.ch/')
  })

  it('never prints a danger level in any unknown state', () => {
    for (const s of UNKNOWNS) {
      expect(unknown(s), s).not.toMatch(/Low|Moderate|Considerable|High|Very high/)
    }
  })

  it('states in words that no bulletin is not safety', () => {
    for (const s of UNKNOWNS) {
      const h = unknown(s).toLowerCase()
      expect(
        h.includes('not the same as safe') ||
          h.includes('not an all-clear') ||
          h.includes('not the same as no danger') ||
          h.includes('out of date'),
        s
      ).toBe(true)
    }
  })

  it('renders no bulletin content before the first sync', () => {
    // Honox still emits an empty island wrapper; what matters is that no
    // panel, and above all no reassuring text, reaches the page.
    const h = body(null)
    expect(h).not.toContain('bulletin')
    expect(h).not.toContain('Avalanche')
  })

  it('raises the surface at considerable and above', () => {
    expect(body({ ...base, level: 3 })).toContain('bulletin-high')
    expect(body({ ...base, level: 2 })).toContain('bulletin-known')
  })
})
