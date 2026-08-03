import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { conditionLabel, metIcon, wmoIcon } from './icons'
import type { Condition } from './warnings'

const WX_DIR = path.resolve(__dirname, '../../public/wx')
const files = new Set(fs.readdirSync(WX_DIR).filter((f) => f.endsWith('.svg')))
const onDisk = (url: string) => files.has(url.replace('/wx/', ''))

const ALL_WMO = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85,
  86, 95, 96, 99
]

describe('the vendored icon set', () => {
  it('holds the expected 83 SVGs', () => {
    expect(files.size).toBe(83)
  })
})

describe('wmoIcon', () => {
  it('resolves every WMO code to a file that exists, day and night', () => {
    for (const code of ALL_WMO) {
      for (const isDay of [true, false]) {
        const url = wmoIcon(code, isDay)
        expect(onDisk(url), `${code} isDay=${isDay} -> ${url}`).toBe(true)
      }
    }
  })

  it('falls back to cloudy for null and unknown codes', () => {
    expect(wmoIcon(null, true)).toBe('/wx/cloudy.svg')
    expect(wmoIcon(4242, true)).toBe('/wx/cloudy.svg')
  })

  it('suffixes only bases that ship day variants', () => {
    expect(wmoIcon(0, true)).toBe('/wx/clearsky_day.svg')
    expect(wmoIcon(0, false)).toBe('/wx/clearsky_night.svg')
    expect(wmoIcon(3, true)).toBe('/wx/cloudy.svg')
    expect(wmoIcon(45, true)).toBe('/wx/fog.svg')
  })
})

describe('metIcon', () => {
  it('round-trips all 83 real filenames to files that exist', () => {
    for (const f of files) {
      const url = metIcon(f.replace(/\.svg$/, ''))
      expect(onDisk(url), `${f} -> ${url}`).toBe(true)
    }
  })

  it('remaps the doubled-s filenames MET spells correctly', () => {
    expect(metIcon('lightsleetshowersandthunder_day')).toBe(
      '/wx/lightssleetshowersandthunder_day.svg'
    )
    expect(metIcon('lightsnowshowersandthunder_day')).toBe(
      '/wx/lightssnowshowersandthunder_day.svg'
    )
  })

  it('falls back to cloudy for an unknown symbol', () => {
    expect(metIcon('nonsense')).toBe('/wx/cloudy.svg')
  })
})

describe('condition copy', () => {
  it('labels and glyphs every condition, so severity is never colour-only', () => {
    const all: Condition[] = ['rain', 'hail', 'wind', 'snow', 'heat', 'blizzard', 'thunderstorm']
    for (const c of all) expect(conditionLabel[c]).toBeTruthy()
  })
})
