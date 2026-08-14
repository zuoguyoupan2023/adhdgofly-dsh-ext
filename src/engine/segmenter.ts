/**
 * Text segmentation: BMM for CJK, space-delimited for European languages.
 * Ported from dict-app/src-vue/utils/segmenter.js — no external dependencies.
 */
import type { Segment, SupportedLang } from './types'
import { isSpaceDelimited } from './language'
import { lookupWithLemma } from './lemmatizer'

type DictMap = Record<string, { pos: string[] } | string>

function getPosString(entry: { pos: string[] } | string | null | undefined): string | null {
  if (!entry) return null
  if (typeof entry === 'string') return entry
  if (Array.isArray(entry.pos)) return entry.pos.join(',')
  return null
}

/**
 * Segment space-delimited text (English, French, Spanish, Russian).
 */
export function segmentSpaceDelimited(text: string, dict: DictMap, lang: SupportedLang): Segment[] {
  const segments: Segment[] = []
  const tokens = text.split(/(\s+|[.,!?;:()\[\]{}"'\/\\—\-])/)
  let pos = 0

  for (const token of tokens) {
    if (!token) continue
    // Find the actual word-character run within the token so decoration
    // ranges correctly highlight only the matched word, not surrounding
    // CJK / punctuation that was stripped by the replace() below.
    const wordMatch = token.match(/[\w'-]+/)
    if (!wordMatch) { pos += token.length; continue }

    const rawWord = wordMatch[0]
    const clean = rawWord.toLowerCase()

    let entry: { pos: string[] } | string | null = null
    if (lang === 'en') {
      entry = lookupWithLemma(clean, dict) as typeof entry
    } else {
      entry = dict[clean] ?? null
    }

    const posStr = getPosString(entry)
    segments.push({
      word: clean,
      start: pos + wordMatch.index!,
      end: pos + wordMatch.index! + rawWord.length,
      is_in_dict: posStr !== null,
      pos: posStr,
    })
    pos += token.length
  }
  return segments
}

/**
 * Segment CJK text using forward maximum matching (BMM).
 */
export function segmentCJK(text: string, dict: DictMap, maxLen = 8): Segment[] {
  const segments: Segment[] = []
  let i = 0

  while (i < text.length) {
    const c = text[i]

    // Skip whitespace and punctuation
    if (/[\s\p{P}]/u.test(c)) { i++; continue }

    // Non-CJK, non-ASCII: skip
    if (!/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(c) && !/[a-zA-Z0-9]/.test(c)) {
      i++; continue
    }

    // ASCII word block
    if (/[a-zA-Z0-9]/.test(c)) {
      const start = i
      while (i < text.length && /[a-zA-Z0-9]/.test(text[i])) i++
      const word = text.slice(start, i).toLowerCase()
      const entry = dict[word] ?? null
      const posStr = getPosString(entry as { pos: string[] } | string | null)
      segments.push({ word, start, end: i, is_in_dict: posStr !== null, pos: posStr })
      continue
    }

    // CJK: forward max matching
    const maxLookup = Math.min(maxLen, text.length - i)
    let matched = false

    for (let len = maxLookup; len >= 1; len--) {
      const word = text.slice(i, i + len)
      const entry = dict[word] ?? null
      if (entry != null) {
        const posStr = getPosString(entry as { pos: string[] } | string | null)
        segments.push({ word, start: i, end: i + len, is_in_dict: true, pos: posStr })
        i += len
        matched = true
        break
      }
    }

    if (!matched) {
      segments.push({ word: c, start: i, end: i + 1, is_in_dict: false, pos: null })
      i++
    }
  }

  return segments
}

/**
 * Dispatch to the correct segmentation strategy based on language.
 */
export function segmentText(text: string, lang: SupportedLang, dict: DictMap): Segment[] {
  if (isSpaceDelimited(lang)) {
    return segmentSpaceDelimited(text, dict, lang)
  }
  return segmentCJK(text, dict)
}

/**
 * Mixed-language segmentation — no language classification.
 * Scans text character-by-character and dispatches:
 *
 *   ASCII  → accumulate contiguous ASCII block → look up in latinDict (+ lemmatizer when enEnabled)
 *   CJK    → forward max matching against cjkDict → multi-char words are found, NOT single char
 *   Other  → skip (whitespace, punctuation, emoji)
 *
 * Each CJK position runs full forward max matching, so "键盘" matches
 * as a single 2-char entry if present in cjkDict — never "键"+"盘".
 *
 * Ported from dict-app/src-tauri/src/segmenter.rs `segment_with_lang()`.
 */
export function segmentMixed(
  text: string,
  latinDict: DictMap,
  cjkDict: DictMap,
  enEnabled: boolean,
  maxLen = 8,
): Segment[] {
  const segments: Segment[] = []
  let pos = 0

  // Use text[pos] (UTF-16 code unit indexing) to stay consistent with
  // VS Code's TextDocument.getText() and offsetAt() — both use UTF-16.
  // Characters outside the BMP (emoji, rare CJK) use surrogate pairs
  // (2 code units each), so each surrogate unit is individually tested
  // and skipped by the non-ASCII/non-CJK fallthrough below.
  while (pos < text.length) {
    const c = text[pos]

    // Skip whitespace and punctuation
    if (/[\s\p{P}]/u.test(c)) { pos++; continue }

    // Non-CJK, non-ASCII, non-Latin: skip (emoji, symbols, etc.)
    if (!/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(c) && !/[a-zA-Z0-9]/.test(c)) {
      pos++; continue
    }

    // ── ASCII block (Latin) ────────────────────────────────────────
    if (/[a-zA-Z0-9]/.test(c)) {
      const start = pos
      while (pos < text.length && /[a-zA-Z0-9]/.test(text[pos])) pos++
      const word = text.slice(start, pos).toLowerCase()

      let entry: { pos: string[] } | string | null = null
      if (enEnabled) {
        entry = lookupWithLemma(word, latinDict) as typeof entry
      } else {
        entry = latinDict[word] ?? null
      }
      const posStr = getPosString(entry)

      segments.push({
        word,
        start,
        end: pos,
        is_in_dict: posStr !== null,
        pos: posStr,
      })
      continue
    }

    // ── CJK: forward max matching ──────────────────────────────────
    const maxLookup = Math.min(maxLen, text.length - pos)
    let matched = false

    for (let len = maxLookup; len >= 1; len--) {
      const word = text.slice(pos, pos + len)
      const entry = cjkDict[word] ?? null
      if (entry != null) {
        const posStr = getPosString(entry)
        segments.push({
          word,
          start: pos,
          end: pos + len,
          is_in_dict: true,
          pos: posStr,
        })
        pos += len
        matched = true
        break
      }
    }

    // Single char fallback — NOT in dict
    if (!matched) {
      segments.push({ word: c, start: pos, end: pos + 1, is_in_dict: false, pos: null })
      pos++
    }
  }

  return segments
}
