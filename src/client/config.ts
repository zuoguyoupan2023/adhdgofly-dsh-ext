/**
 * Plugin config — defaults mirror the bundle patch (cordis.patch.yml) and the
 * schemastery schema registered host-side (`src/host/index.ts`). The Loader
 * validates nothing for third-party rows, so merge defensively.
 *
 * v0.1.3 config source is the `adhdgofly` settings namespace served through
 * `ctx.settingsScope` (host-persisted on loopback). localStorage remains only
 * as an init/fallback cache for the moment before the scope reaches `ready`
 * and for remote browsers (scope `unavailable`), and to host the `uiLayout`
 * surface-preference.
 */

export type DecorationStyle = 'color' | 'highlight'
export type LayoutMode = 'both' | 'classic' | 'plugin-card'

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

/** Which settings surfaces render. Stored in localStorage (see §1 D6). */
export const DEFAULT_LAYOUT_MODE: LayoutMode = 'both'

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

// ── localStorage: init fallback + layout preference (NOT the editing source) ──

/** Persistence key for the fallback config cache (v1 kept for backward compat). */
export const STORAGE_KEY = 'adhdgofly.config.v1'
/** Persistence key for the surface-layout preference. */
export const LAYOUT_KEY = 'adhdgofly.uiLayout.v1'

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

/** Read the surface-layout preference (sync, so apply() can pick which slots to register). */
export function loadLayoutMode(): LayoutMode {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw === 'classic' || raw === 'plugin-card' || raw === 'both') return raw
  } catch {
    // ignore
  }
  return DEFAULT_LAYOUT_MODE
}

export function saveLayoutMode(mode: LayoutMode): void {
  try {
    localStorage.setItem(LAYOUT_KEY, mode)
  } catch {
    // ignore
  }
}

/**
 * Minimal wire contract for the settings scope consumed in the browser half.
 * Kept local (no import of @deepseek-ai/dsh-client-ui-settings) to respect the
 * client-bundle purity gate — the service is reached via `ctx.settingsScope`.
 */
export interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value?: T
  base?: unknown
  user?: unknown
  revision?: number
  writable: boolean
  mode: 'host' | 'memory'
}
export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}
export interface SettingsScopeSpec<T> {
  namespace: string
  decode?: (section: unknown) => T | undefined
}
