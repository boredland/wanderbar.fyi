import { describe, expect, it } from 'vitest'
import { FAQ_BY_LOCALE } from './-faq'
import { translator, type MessageKey } from '../lib/i18n'
import { LOCALES } from '../lib/i18n/locale'

/**
 * The FAQ is where the honest caveats live, and it now exists three times.
 * These check the properties that make three copies safe to keep: that none is
 * missing, that the machine-readable twin still says what the prose says, and
 * that the safety caveats were not softened or dropped in translation.
 */
describe('the FAQ in every language', () => {
  it('answers the same questions in every language', () => {
    const counts = LOCALES.map((l) => FAQ_BY_LOCALE[l].length)
    expect(new Set(counts).size, `entry counts differ: ${counts.join(', ')}`).toBe(1)
    expect(counts[0]).toBeGreaterThan(0)
  })

  it('never ships an empty question or answer', () => {
    for (const locale of LOCALES) {
      FAQ_BY_LOCALE[locale].forEach((entry, i) => {
        expect(entry.q.trim(), `${locale}[${i}] question`).not.toBe('')
        expect(entry.text.trim(), `${locale}[${i}] text`).not.toBe('')
        expect(entry.a, `${locale}[${i}] answer`).toBeTruthy()
      })
    }
  })

  it('keeps the JSON-LD twin as long as the prose, so it cannot quietly shrink', () => {
    // The `text` field is what an assistant quotes. If a translation dropped a
    // paragraph from it, the machine-readable answer would be missing exactly
    // the caveat the prose spends its length on.
    for (const locale of LOCALES) {
      FAQ_BY_LOCALE[locale].forEach((entry, i) => {
        const english = FAQ_BY_LOCALE.en[i]
        const ratio = entry.text.length / english.text.length
        expect(ratio, `${locale}[${i}] "${entry.q}" text length ratio`).toBeGreaterThan(0.6)
        expect(ratio, `${locale}[${i}] "${entry.q}" text length ratio`).toBeLessThan(1.8)
      })
    }
  })

  it('does not leave the product name translated', () => {
    for (const locale of LOCALES) {
      for (const entry of FAQ_BY_LOCALE[locale]) {
        expect(entry.text.toLowerCase(), `${locale}: "${entry.q}"`).not.toMatch(/wunderbar/)
      }
    }
  })

  it('uses the issuing services\' own words for the danger scales', () => {
    // These are not translation choices. A reader comparing wanderbar against
    // the bulletin has to find the same term, so they are pinned to the EAWS
    // (avalanche) and EFFIS (fire) published wording. French level 2 is
    // "Limité", never "Modéré".
    const eaws: Record<string, string[]> = {
      en: ['Low', 'Moderate', 'Considerable', 'High', 'Very high'],
      de: ['Gering', 'Mäßig', 'Erheblich', 'Groß', 'Sehr groß'],
      fr: ['Faible', 'Limité', 'Marqué', 'Fort', 'Très fort']
    }
    for (const locale of LOCALES) {
      const t = translator(locale)
      eaws[locale].forEach((word, i) => {
        expect(t(`danger.${i + 1}` as MessageKey), `${locale} level ${i + 1}`).toBe(word)
      })
    }

    const effis: Record<string, string[]> = {
      en: ['very low', 'low', 'moderate', 'high', 'very high', 'extreme'],
      de: ['sehr gering', 'gering', 'mäßig', 'hoch', 'sehr hoch', 'extrem'],
      fr: ['très faible', 'faible', 'modéré', 'élevé', 'très élevé', 'extrême']
    }
    const classes = ['very low', 'low', 'moderate', 'high', 'very high', 'extreme']
    for (const locale of LOCALES) {
      const t = translator(locale)
      classes.forEach((cls, i) => {
        expect(t(`fireDanger.${cls}` as MessageKey), `${locale} fire ${cls}`).toBe(effis[locale][i])
      })
    }
  })

  it('keeps fire danger subordinate to the official ban', () => {
    // The FWI is computed on the device from public history. It is an
    // indication, and a translation that promoted it to an authority would be
    // telling someone it is fine to light a fire.
    const bans: Record<string, RegExp> = {
      en: /always follow the local fire ban/i,
      de: /halte dich immer an das lokale Feuerverbot/i,
      fr: /respecte toujours l'interdiction locale de feu/i
    }
    for (const locale of LOCALES) {
      const fire = FAQ_BY_LOCALE[locale].find((e) => /Fire Weather Index|FWI/.test(e.text))
      expect(fire, `${locale} has no fire answer`).toBeDefined()
      expect(fire!.text, `${locale} fire ban caveat`).toMatch(bans[locale])
    }
  })

  it('keeps the avalanche answer from ever reading as an all-clear', () => {
    // The single most dangerous sentence this app could print is one that
    // turns "no bulletin" into "no danger". Each language states the negation.
    const negations: Record<string, RegExp> = {
      en: /none of those mean the slope is safe/i,
      de: /nichts davon heißt, dass der Hang sicher ist/i,
      fr: /rien de tout ça ne veut dire que la pente est sûre/i
    }
    for (const locale of LOCALES) {
      const avalanche = FAQ_BY_LOCALE[locale].find((e) => /lawin|avalanch/i.test(e.q + e.text))
      expect(avalanche, `${locale} has no avalanche answer`).toBeDefined()
      expect(avalanche!.text, `${locale} avalanche caveat`).toMatch(negations[locale])
    }
  })
})
