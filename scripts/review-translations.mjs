/**
 * Reviews the German and French catalogues against DeepL.
 *
 * Not a generator: the catalogues are hand-written and stay that way. This
 * asks DeepL for an independent rendering of every English source string and
 * reports where ours diverges, so a human reads a short list of disagreements
 * instead of 220 strings. Divergence is not automatically wrong — register
 * choices (du/tu rather than Sie/vous), the untranslated product name, and UI
 * labels quoted inside the FAQ are all deliberate — but every divergence
 * should be one somebody chose.
 *
 * Usage: node scripts/review-translations.mjs [de|fr]
 * Writes /tmp/translation-review-<lang>.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
/**
 * Our own deeplx instance by default; see ../../deeplx-translate. The shared
 * keyless one got our IP blocked by DeepL, which is what this replaced.
 * DEEPLX_KEY is the bearer token that instance requires.
 */
const ENDPOINT = process.env.DEEPLX_URL ?? 'https://translate.jonas-strassel.de/translate'
const KEY = process.env.DEEPLX_KEY ?? ''

/** Values whose whole point is that DeepL must not touch them. */
const SKIP = new Set(['app.title', 'source.open-meteo', 'source.met', 'source.open-meteo+met'])

function catalogue(lang) {
  const src = readFileSync(join(ROOT, `app/lib/i18n/${lang}.ts`), 'utf8')
  const body = src.slice(src.indexOf('= {'))
  const out = new Map()
  // Single- or double-quoted value, optionally on the next line.
  const re = /^ {2}'([^']+)':\s*\n?\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm
  for (const m of body.matchAll(re)) {
    out.set(m[1], (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
  return out
}

/** Placeholders must survive translation, so they are masked, not sent. */
const mask = (s) => s.replace(/\{(\w+)\}/g, (_, n) => `XPH${n.toUpperCase()}X`)
const unmask = (s) => s.replace(/XPH([A-Z]+)X/g, (_, n) => `{${n.toLowerCase()}}`)

async function translate(text, target) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(KEY ? { authorization: `Bearer ${KEY}` } : {})
    },
    body: JSON.stringify({ text: mask(text), source_lang: 'EN', target_lang: target.toUpperCase() })
  })
  const json = await res.json()
  if (json.code !== 200 && json.data === undefined) {
    throw new Error(`${json.code}: ${json.message ?? 'no data'}`)
  }
  return unmask(String(json.data))
}

/** Word overlap, ignoring case and punctuation: cheap and good enough to rank. */
function similarity(a, b) {
  const words = (s) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
    )
  const wa = words(a)
  const wb = words(b)
  if (wa.size === 0 && wb.size === 0) return 1
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return (2 * shared) / (wa.size + wb.size)
}

const lang = process.argv[2] ?? 'de'
const en = catalogue('en')
const mine = catalogue(lang)

const rows = []
let failed = 0
for (const [key, source] of en) {
  if (SKIP.has(key)) continue
  const ours = mine.get(key)
  if (ours === undefined) continue
  // Pure format strings carry no prose to review.
  if (!/\p{L}{2}/u.test(source.replace(/\{\w+\}/g, ''))) continue
  try {
    const theirs = await translate(source, lang)
    rows.push({ key, source, ours, theirs, score: similarity(ours, theirs) })
  } catch (e) {
    failed++
    if (failed > 5) throw new Error(`DeepL unavailable after ${failed} failures: ${e.message}`)
  }
  // Paced: this endpoint is a free shared instance and blocks on bursts.
  await new Promise((r) => setTimeout(r, 250))
}

rows.sort((a, b) => a.score - b.score)
const lines = [
  `# ${lang.toUpperCase()} catalogue vs DeepL`,
  '',
  `${rows.length} strings compared, ordered by divergence (lowest overlap first).`,
  'Divergence is not automatically an error: register, the untranslated product',
  'name, and UI labels quoted verbatim are deliberate. Read the top of the list.',
  ''
]
for (const r of rows) {
  lines.push(`## ${r.key}  (overlap ${(r.score * 100).toFixed(0)}%)`)
  lines.push(`- EN:     ${r.source}`)
  lines.push(`- ours:   ${r.ours}`)
  lines.push(`- DeepL:  ${r.theirs}`)
  lines.push('')
}
writeFileSync(`/tmp/translation-review-${lang}.md`, lines.join('\n'))
console.log(`compared ${rows.length} strings -> /tmp/translation-review-${lang}.md`)
