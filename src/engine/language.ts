import type { SupportedLang, LanguageSegment } from './types'

const SPACE_LANGS = new Set<SupportedLang>(['en', 'fr', 'es', 'ru'])

export function isSpaceDelimited(lang: SupportedLang): boolean {
  return SPACE_LANGS.has(lang)
}

/**
 * Detect language of a text sample.
 * Returns 'en' as fallback for short or ambiguous text.
 */
export function detectLanguage(text: string): SupportedLang {
  if (!text || text.length < 5) return 'en'
  const sample = text.slice(0, 1000)
  const total = sample.length

  const cjkCount = (sample.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length
  if (cjkCount / total > 0.3) {
    const zhCount = (sample.match(/[\u4e00-\u9fff]/g) || []).length
    const jaCount = (sample.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length
    return jaCount > zhCount ? 'ja' : 'zh'
  }
  if ((sample.match(/[\u0400-\u04ff]/g) || []).length / total > 0.3) return 'ru'
  return 'en'
}

/**
 * Split a document into language segments for mixed-language text.
 * Each paragraph is analysed independently so a Chinese README with English
 * code comments is handled correctly.
 *
 * Uses a regex exec loop to track the *exact* byte offset of each paragraph,
 * avoiding the off-by-N error that occurred when the separator matched more
 * than two newlines but the old code always added exactly 2.
 */
export function detectLanguageSegments(text: string): LanguageSegment[] {
  const segments: LanguageSegment[] = []
  // Match runs of non-blank text (paragraphs separated by one-or-more blank lines)
  const separatorRe = /\n{2,}/g
  let lastEnd = 0

  let match: RegExpExecArray | null
  while ((match = separatorRe.exec(text)) !== null) {
    const para = text.slice(lastEnd, match.index)
    if (para.trim().length > 0) {
      segments.push({ text: para, offset: lastEnd, lang: detectLanguage(para) })
    }
    lastEnd = match.index + match[0].length // skip the exact separator (could be \n\n\n etc.)
  }

  // Tail segment after the last separator (or the whole text if no separator found)
  const tail = text.slice(lastEnd)
  if (tail.trim().length > 0) {
    segments.push({ text: tail, offset: lastEnd, lang: detectLanguage(tail) })
  }

  return segments.length > 0 ? segments : [{ text, offset: 0, lang: detectLanguage(text) }]
}
