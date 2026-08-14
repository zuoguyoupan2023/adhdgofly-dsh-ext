/**
 * Build compact dictionaries for the DSH client bundle.
 *
 * Reads the original adhdgofly-ide-ext dictionaries (build-time only; the
 * repo and runtime never read the large raw files) and emits
 * `dicts/en.compact.json` / `dicts/zh.compact.json` as `word → posKey`,
 * where posKey ∈ { 'n', 'v', 'a', 'o' }.
 *
 * posToKey MUST stay in sync with `src/engine/matcher.ts` POS_COLOR_MAP:
 *   n/nr/ns/nt/nz/t → 'n';  v → 'v';
 *   adj/a/adv/d     → 'a';  everything else → 'o'
 *
 * Usage: node scripts/build-dicts.mjs
 * The ide-ext checkout is located via $IDE_EXT_ROOT, defaulting to the
 * sibling checkout at /Users/burenweiye/Documents/GitHub/adhdgofly-ide-ext.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'dicts')
fs.mkdirSync(outDir, { recursive: true })

const ideExtRoot = process.env.IDE_EXT_ROOT ?? '/Users/burenweiye/Documents/GitHub/adhdgofly-ide-ext'

/** POS key mapping — synced with src/engine/matcher.ts POS_COLOR_MAP. */
function posToKey(posStr) {
  const primary = posStr.split(',')[0].trim().toLowerCase()
  if (primary === 'n' || primary === 'nr' || primary === 'ns' || primary === 'nt' || primary === 'nz' || primary === 't') return 'n'
  if (primary === 'v') return 'v'
  if (primary === 'adj' || primary === 'a' || primary === 'adv' || primary === 'd') return 'a'
  return 'o'
}

function buildDict(lang, fileName) {
  const filePath = path.join(ideExtRoot, 'dictionaries', fileName)
  console.log(`Loading ${lang} dictionary from ${filePath}...`)
  if (!fs.existsSync(filePath)) {
    throw new Error(`dictionary not found: ${filePath} (set IDE_EXT_ROOT to the adhdgofly-ide-ext checkout)`)
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const entries = Object.entries(raw.words ?? {})
  if (entries.length === 0) throw new Error(`${fileName}: no "words" entries`)

  const posMap = {}
  for (const [word, entry] of entries) {
    if (entry && Array.isArray(entry.pos) && entry.pos.length > 0) {
      posMap[word.toLowerCase()] = posToKey(entry.pos[0])
    }
  }

  // Deterministic output (sorted keys)
  const sorted = Object.keys(posMap).sort()
  const result = {}
  for (const w of sorted) result[w] = posMap[w]

  const outFile = path.join(outDir, `${lang}.compact.json`)
  const js = JSON.stringify(result)
  fs.writeFileSync(outFile, js)
  const kb = (Buffer.byteLength(js, 'utf-8') / 1024).toFixed(1)
  console.log(`  ${Object.keys(result).length} words -> ${outFile} (${kb}KB)`)
  return { words: Object.keys(result).length, kb }
}

console.log('=== Building compact dictionaries ===')
const en = buildDict('en', 'EN_word.json')
const zh = buildDict('zh', 'ZH_word.json')
const totalMb = ((Number(en.kb) + Number(zh.kb)) / 1024).toFixed(1)
console.log(`Done: en ${en.words} words, zh ${zh.words} words, combined ${totalMb}MB`)
