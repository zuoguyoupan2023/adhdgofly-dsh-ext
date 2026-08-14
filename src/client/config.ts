/**
 * Plugin config — defaults mirror the bundle patch (cordis.patch.yml) and the
 * adhdgofly-ide-ext settings (docs/007-config-reference / README).
 * The Loader validates nothing for third-party rows, so merge defensively.
 */

export type DecorationStyle = 'color' | 'highlight'

export interface AdhdgoflyConfig {
  enabled: boolean
  /** Enabled dictionary languages: 'en' | 'zh' (subset). */
  languages: string[]
  minWordLength: number
  decorationStyle: DecorationStyle
  /** POS filter keys: subset of ['n', 'v', 'a', 'o']. */
  posFilter: string[]
  /** CSS selectors of the root containers to highlight (rendered Markdown areas). */
  containers: string[]
  /** Reserved — DSH has no comment concept. */
  highlightInComments: boolean
}

export const DEFAULT_CONFIG: AdhdgoflyConfig = {
  enabled: true,
  languages: ['en', 'zh'],
  minWordLength: 2,
  decorationStyle: 'color',
  posFilter: ['n', 'v', 'a', 'o'],
  containers: ['[data-conversation-scroll]'],
  highlightInComments: false,
}

const asStrArray = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

export function normalizeConfig(raw: unknown): AdhdgoflyConfig {
  const r = (raw ?? {}) as Record<string, unknown>
  const cfg: AdhdgoflyConfig = { ...DEFAULT_CONFIG }
  if (typeof r.enabled === 'boolean') cfg.enabled = r.enabled
  const langs = asStrArray(r.languages).filter((l) => l === 'en' || l === 'zh')
  if (langs.length > 0) cfg.languages = langs
  if (typeof r.minWordLength === 'number' && Number.isFinite(r.minWordLength)) {
    cfg.minWordLength = Math.max(1, Math.floor(r.minWordLength))
  }
  if (r.decorationStyle === 'color' || r.decorationStyle === 'highlight') cfg.decorationStyle = r.decorationStyle
  const filter = asStrArray(r.posFilter)
  if (filter.length > 0) cfg.posFilter = filter
  const containers = asStrArray(r.containers)
  if (containers.length > 0) cfg.containers = containers
  if (typeof r.highlightInComments === 'boolean') cfg.highlightInComments = r.highlightInComments
  return cfg
}

/** Persistence key for user settings (v1: browser-local storage). */
export const STORAGE_KEY = 'adhdgofly.config.v1'

export function loadPersistedConfig(): AdhdgoflyConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return normalizeConfig(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function savePersistedConfig(config: AdhdgoflyConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // storage unavailable (private mode etc.) — settings stay in memory
  }
}
