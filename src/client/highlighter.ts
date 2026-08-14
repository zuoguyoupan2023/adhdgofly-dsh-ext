/**
 * DOM POS highlighter for DSH Web — ported from adhdgofly-ide-ext
 * src/preview/highlighter.ts (MIT).
 *
 * Differences from the preview bluebook:
 *  - target containers come from config (default `[data-conversation-scroll]`);
 *  - theme follows the DSH `theme` service (falls back to prefers-color-scheme);
 *  - streaming messages (`[data-streaming]`) are deferred until settled;
 *  - debounce + reentrancy lock + processed-text tracking against React churn;
 *  - colors/decorationStyle/posFilter live in one regenerated <style> tag.
 *
 * Offsets are UTF-16 code units (JS string indices) — they map 1:1 onto the
 * DOM text nodes, exactly like the preview implementation.
 */

import { process as engineProcess } from '../engine'
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  POS_KEYS,
  colorClassToKey,
  hexToRgba,
  type PosKey,
} from './palette'
import { normalizeConfig, type AdhdgoflyConfig } from './config'

/** Compact dictionaries, injected by build.mjs as closure globals. */
declare const __ADHD_DICT_EN: Record<string, string>
declare const __ADHD_DICT_ZH: Record<string, string>

export const HIGHLIGHT_CLASS = 'adhdgofly-hl'
export const STYLE_TAG_ID = 'adhdgofly-style'

const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEMPLATE', 'SVG', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION'])
const DEBOUNCE_MS = 400
const CONTAINER_QUERY = '.markdown-code-block, [class*="markdown-code-block"]'

/** Minimal theme bridge so the highlighter stays framework-agnostic. */
export interface ThemeBridge {
  isDark(): boolean
  /** Register a change listener; returns a disposer. */
  subscribe(callback: () => void): () => void
}

function isInside(element: Element | null, selector: string): boolean {
  return !!element?.closest(selector)
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent) return true
  if (parent.classList.contains(HIGHLIGHT_CLASS)) return true
  // Walk ancestors manually (TreeWalker FILTER_REJECT semantics).
  let el: Element | null = parent
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') return true
    if (el.hasAttribute('contenteditable')) return true
    if (el.hasAttribute('data-decoration')) return true
    if (el.matches(CONTAINER_QUERY)) return true
    el = el.parentElement
  }
  return false
}

function isStreamingNode(node: Text): boolean {
  return isInside(node.parentElement, '[data-streaming]')
}

/** Match a rendered Markdown container (may mount late). */
function findContainers(cfg: AdhdgoflyConfig): Element[] {
  const found: Element[] = []
  for (const selector of cfg.containers) {
    try {
      for (const el of document.querySelectorAll(selector)) {
        if (!found.includes(el)) found.push(el)
      }
    } catch {
      // invalid selector — skip quietly
    }
  }
  return found
}

export class ADHDGoFlyHighlighter {
  private cfg: AdhdgoflyConfig
  private readonly theme: ThemeBridge
  private dark: boolean
  private observer: MutationObserver | null = null
  private processing = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private styleTag: HTMLStyleElement | null = null
  private readonly processedText = new WeakMap<Text, string>()
  private disposed = false
  private readonly unsubscribeTheme: () => void
  private readonly onMutation = () => {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.scheduleProcess(), DEBOUNCE_MS)
  }

  constructor(theme: ThemeBridge, rawConfig: unknown) {
    this.cfg = normalizeConfig(rawConfig)
    this.theme = theme
    this.dark = theme.isDark()
    this.unsubscribeTheme = theme.subscribe(() => {
      this.dark = theme.isDark()
      // Colors live in the injected stylesheet — spans recolor automatically.
      this.renderStyle()
    })
    this.installStyle()
    this.startObserver()
    // First pass once the DOM is ready.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scheduleProcess(), { once: true })
    } else {
      this.scheduleProcess()
    }
  }

  /** Replace config at runtime (settings UI). */
  update(rawConfig: unknown): void {
    this.cfg = normalizeConfig(rawConfig)
    this.renderStyle()
    this.scheduleProcess()
  }

  dispose(): void {
    this.disposed = true
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.observer?.disconnect()
    this.observer = null
    this.unsubscribeTheme()
    this.styleTag?.remove()
    this.styleTag = null
  }

  // ── style injection ────────────────────────────────────────────

  private installStyle(): void {
    if (this.styleTag) return
    const existing = document.getElementById(STYLE_TAG_ID)
    this.styleTag = (existing as HTMLStyleElement | null) ?? document.createElement('style')
    this.styleTag.id = STYLE_TAG_ID
    if (!existing) document.head.appendChild(this.styleTag)
    this.renderStyle()
  }

  private palette(): Record<PosKey, string> {
    return this.dark ? DARK_PALETTE : LIGHT_PALETTE
  }

  private renderStyle(): void {
    if (!this.styleTag) return
    const palette = this.palette()
    const rules: string[] = []
    const style = this.cfg.decorationStyle

    for (const key of POS_KEYS) {
      const color = palette[key]
      if (style === 'highlight') {
        rules.push(`.${HIGHLIGHT_CLASS}[data-pos="${key}"]{color:${color};background:${hexToRgba(color, 0.15)};border:1px solid ${hexToRgba(color, 0.35)};border-radius:4px;font-weight:500}`)
      } else {
        rules.push(`.${HIGHLIGHT_CLASS}[data-pos="${key}"]{color:${color};font-weight:500}`)
      }
    }

    // posFilter — keep text, drop the highlight (CSS override, no re-tokenize).
    for (const key of POS_KEYS) {
      if (!this.cfg.posFilter.includes(key)) {
        rules.push(`.${HIGHLIGHT_CLASS}[data-pos="${key}"]{color:inherit!important;background:transparent!important;border-color:transparent!important;font-weight:inherit!important}`)
      }
    }

    this.styleTag.textContent = rules.join('')
  }

  // ── observation ────────────────────────────────────────────────

  private startObserver(): void {
    if (this.observer) return
    this.observer = new MutationObserver((mutations) => {
      // Cheap filter: only care about mutations inside our containers, plus
      // container appearance (any mutation) — scheduleProcess re-checks.
      const relevant = mutations.some((m) => {
        const t = m.target
        if (t instanceof Element) return true
        return t?.parentElement !== null
      })
      if (relevant) this.onMutation()
    })
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-streaming'],
    })
  }

  // ── processing ─────────────────────────────────────────────────

  private scheduleProcess(): void {
    if (this.disposed || this.processing) return
    this.processing = true
    try {
      this.processAll()
    } catch (error) {
      console.error('[adhdgofly-dsh-ext] highlight error:', error)
    } finally {
      this.processing = false
    }
  }

  private processAll(): void {
    if (!this.cfg.enabled) return
    const containers = findContainers(this.cfg)
    if (containers.length === 0) return

    // Streaming messages are skipped per text node (isStreamingNode); settled
    // content is highlighted immediately so a long stream does not blank the
    // whole conversation.
    for (const container of containers) {
      this.processContainer(container)
    }
  }

  private processContainer(container: Element): void {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node as Text // SHOW_TEXT guarantees Text nodes here
        if (shouldSkipTextNode(text)) return NodeFilter.FILTER_REJECT
        if (isStreamingNode(text)) return NodeFilter.FILTER_REJECT
        if (!text.textContent || text.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    const nodes: Text[] = []
    let n: Text | null
    while ((n = walker.nextNode() as Text | null)) nodes.push(n)

    for (const node of nodes) {
      const text = node.textContent ?? ''
      // Skip nodes we already processed with identical content.
      if (this.processedText.get(node) === text) continue
      this.wrapNode(node, text)
    }
  }

  private wrapNode(node: Text, text: string): void {
    const enEnabled = this.cfg.languages.includes('en')
    const matches = engineProcess(text, __ADHD_DICT_EN, __ADHD_DICT_ZH, enEnabled, {
      minWordLength: this.cfg.minWordLength,
      posFilter: this.cfg.posFilter,
    })
    if (matches.length === 0) {
      this.processedText.set(node, text)
      return
    }

    const parent = node.parentNode
    if (!parent) return
    const fragment = document.createDocumentFragment()
    let lastEnd = 0
    for (const m of matches) {
      if (m.start > lastEnd) fragment.appendChild(document.createTextNode(text.slice(lastEnd, m.start)))
      const span = document.createElement('span')
      span.className = HIGHLIGHT_CLASS
      span.dataset.pos = colorClassToKey(m.colorClass)
      span.textContent = text.slice(m.start, m.end)
      fragment.appendChild(span)
      lastEnd = m.end
    }
    if (lastEnd < text.length) fragment.appendChild(document.createTextNode(text.slice(lastEnd)))

    try {
      parent.replaceChild(fragment, node)
    } catch {
      return // node was detached by React mid-flight — drop silently
    }
    this.processedText.set(node, text)
  }
}

/** Fallback dark detection when the DSH theme service is unavailable. */
export function fallbackIsDark(): boolean {
  return typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)').matches : true
}

export function fallbackSubscribe(cb: () => void): () => void {
  if (typeof matchMedia === 'undefined') return () => {}
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const handler = () => cb()
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
