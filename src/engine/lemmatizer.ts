/**
 * English-only lemmatizer using suffix-stripping rules.
 * Other languages use exact-match lookup (no lemmatization in Phase 1).
 *
 * Rules have known exceptions — a blacklist prevents obvious wrong stems.
 */

const BLACKLIST = new Set([
  // words whose stem after stripping would be nonsense
  'ring', 'sing', 'king', 'wing', 'bring', 'spring', 'string', 'sting',
  'swing', 'thing', 'cling', 'fling', 'sling',
])

const SUFFIXES: Array<{ suffix: string; strip: number }> = [
  { suffix: 'tion',  strip: 4 },
  { suffix: 'ing',   strip: 3 },
  { suffix: 'est',   strip: 3 },
  { suffix: 'ness',  strip: 4 },
  { suffix: 'ment',  strip: 4 },
  { suffix: 'able',  strip: 4 },
  { suffix: 'ible',  strip: 4 },
  { suffix: 'ful',   strip: 3 },
  { suffix: 'less',  strip: 4 },
  { suffix: 'ly',    strip: 2 },
  { suffix: 'er',    strip: 2 },
  { suffix: 'ed',    strip: 2 },
  { suffix: 'es',    strip: 2 },
  { suffix: 's',     strip: 1 },
]

/**
 * Try to find a dictionary entry for `word` (English).
 * Returns the dict value if found, or null.
 */
export function lookupWithLemma(word: string, dict: Record<string, unknown>): unknown | null {
  const lower = word.toLowerCase()
  if (BLACKLIST.has(lower)) return dict[lower] ?? null

  // Direct lookup first
  if (dict[lower] != null) return dict[lower]

  // Suffix stripping
  for (const { suffix, strip } of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length > strip + 2) {
      const stem = lower.slice(0, -strip)
      if (dict[stem] != null) return dict[stem]
      // try stem + 'e' (e.g. "making" → "make")
      if (dict[stem + 'e'] != null) return dict[stem + 'e']
      // try doubled consonant: "running" → "run"
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        const deduped = stem.slice(0, -1)
        if (dict[deduped] != null) return dict[deduped]
      }
    }
  }

  // Final -e removal (e.g. "close" in dict, "closes" already handled above)
  if (lower.endsWith('e') && lower.length > 3) {
    const noE = lower.slice(0, -1)
    if (dict[noE] != null) return dict[noE]
  }

  return null
}
