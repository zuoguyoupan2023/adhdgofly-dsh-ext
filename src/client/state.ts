/**
 * Module-level singleton so the settings UI (same bundle) can reach the
 * running highlighter without import cycles.
 */
import type { ADHDGoFlyHighlighter } from './highlighter'

let current: ADHDGoFlyHighlighter | null = null

export function setHighlighter(hl: ADHDGoFlyHighlighter | null): void {
  current = hl
}

export function getHighlighter(): ADHDGoFlyHighlighter | null {
  return current
}

export function updateHighlighterConfig(config: unknown): void {
  current?.update(config)
}
