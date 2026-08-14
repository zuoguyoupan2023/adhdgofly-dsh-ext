/**
 * adhdgofly-dsh-ext — client half.
 *
 * Bundled to lib/client.js (window.__ModuleLoader__.load format, see build.mjs)
 * and activated by the browser Cordis Loader as `apply(ctx, config)` where
 * `config` is this row's config from the composed cordis tree.
 */

import {
  ADHDGoFlyHighlighter,
  fallbackIsDark,
  fallbackSubscribe,
  type ThemeBridge,
} from './highlighter'

/** Services this plugin hard-depends on. None — everything is optional. */
export const inject: string[] = []

/** The live highlighter instance, reached by the settings UI. */
let current: ADHDGoFlyHighlighter | null = null

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
  ctx.effect(() => {
    current = new ADHDGoFlyHighlighter(makeThemeBridge(ctx), config)
    return () => {
      current?.dispose()
      current = null
    }
  }, 'adhdgofly: highlighter')
}

/** Runtime config update entry for the settings UI. */
export function updateConfig(config: unknown): void {
  current?.update(config)
}
