/**
 * adhdgofly-dsh-ext — client half.
 *
 * Bundled to lib/client.js (window.__ModuleLoader__.load format, see build.mjs)
 * and activated by the browser Cordis Loader as `apply(ctx, config)`. Note:
 * in DSH 0.1.0-rc.6 the client Loader creates entries by name only, so the
 * row `config` from cordis.patch.yml does NOT reach the client — settings are
 * read from localStorage (defaults) and edited in the settings section.
 */

import {
  ADHDGoFlyHighlighter,
  fallbackIsDark,
  fallbackSubscribe,
  type ThemeBridge,
} from './highlighter'
import { loadPersistedConfig } from './config'
import { setHighlighter, updateHighlighterConfig } from './state'
import { registerSettingsSection } from './settings'

/** Services this plugin hard-depends on. None — everything is optional. */
export const inject: string[] = []

interface ThemeLike {
  getTheme(): { active?: { colorScheme?: string } }
}

function makeThemeBridge(ctx: any): ThemeBridge {
  const theme = ctx.get('theme') as ThemeLike | undefined
  if (theme && typeof theme.getTheme === 'function') {
    return {
      isDark: () => {
        try {
          return theme.getTheme()?.active?.colorScheme === 'dark'
        } catch {
          return fallbackIsDark()
        }
      },
      // 'theme/change' is emitted by @deepseek-ai/dsh-client-ui-theme;
      // ctx.on is fiber-owned, so the disposer is a no-op.
      subscribe: (cb) => {
        ctx.on('theme/change', cb)
        return () => {}
      },
    }
  }
  return { isDark: fallbackIsDark, subscribe: fallbackSubscribe }
}

export function apply(ctx: any, config: unknown): void {
  // Row config does not reach the client (see file header); persisted settings
  // win over the defaults baked into the bundle.
  const initial = loadPersistedConfig()

  ctx.effect(() => {
    const hl = new ADHDGoFlyHighlighter(makeThemeBridge(ctx), initial)
    setHighlighter(hl)
    registerSettingsSection(ctx)
    return () => {
      setHighlighter(null)
      hl.dispose()
    }
  }, 'adhdgofly: highlighter + settings')
}

/** Runtime config update entry (settings UI / future host RPC). */
export function updateConfig(config: unknown): void {
  updateHighlighterConfig(config)
}
