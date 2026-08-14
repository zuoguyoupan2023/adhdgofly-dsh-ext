/**
 * Pure highlight engine entry — zero DSH/vscode imports.
 *
 * Copied from adhdgofly-ide-ext `src/highlightEngine` (MIT, same ecosystem).
 * The ide-ext original ties `HighlightEngine` to its vscode DictionaryManager;
 * DSH runs segmentation directly against the compact embedded dictionaries
 * (word → posKey "n"|"v"|"a"|"o"), so the class is dropped and a pure
 * `process` helper is provided instead.
 */

/**
 * Strip markdown code block content from text, replacing with spaces
 * while preserving newline positions so line offsets remain valid.
 * Supports:
 * - Fenced code blocks: ``` ... ```
 * - Inline code spans: `code`
 *
 * DOM highlighting usually skips code nodes structurally (PRE/CODE/...),
 * but this stays useful when extracting text from message sources.
 */
export function sanitizeCodeBlocks(text: string): string {
  // Replace fenced code blocks, preserving newlines for offset accuracy
  let result = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
  // Replace inline code spans (\n not possible in inline spans)
  result = result.replace(/(?<!`)`[^`\n]+`(?!`)/g, (m) => ' '.repeat(m.length))
  return result
}

export * from './types'
export * from './language'
export * from './lemmatizer'
export * from './matcher'
export * from './segmenter'

import type { DecoratedWord } from './types'
import { segmentMixed } from './segmenter'
import { matchSegments } from './matcher'

export interface ProcessConfig {
  /** Minimum word length (code units) to highlight. */
  minWordLength: number
  /** POS filter keys: subset of ['n', 'v', 'a', 'o'] ('o' = other). */
  posFilter: string[]
}

/**
 * Pure single-pass segmentation + filtering against compact dictionaries.
 * Latin segments are lemmatized when `enEnabled` (English enabled).
 *
 * @param text - rendered DOM text (UTF-16 offsets returned are JS indices).
 * @param latinDict - compact latin dictionary (word → posKey).
 * @param cjkDict - compact CJK dictionary (word → posKey).
 * @param enEnabled - run the English lemmatizer for ASCII blocks.
 * @returns matched words that survived `matchSegments` (in dict, length, filter).
 */
export function process(
  text: string,
  latinDict: Record<string, string>,
  cjkDict: Record<string, string>,
  enEnabled: boolean,
  config: ProcessConfig,
): DecoratedWord[] {
  const segments = segmentMixed(text, latinDict, cjkDict, enEnabled)
  return matchSegments(segments, config.minWordLength, config.posFilter)
}
